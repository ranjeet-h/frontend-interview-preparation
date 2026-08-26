# What is process.nextTick

## 1. Why This Exists — The Problem First

Early Node APIs used callbacks. Sometimes the work finished **synchronously**—file already in cache, connection already open. If Node invoked your callback immediately, still on the same stack turn, you got inconsistent behavior: sometimes sync stack traces, sometimes async; sometimes re-entrancy bugs where your callback ran before the caller finished setup.

Node needed a way to say: "this operation is done, but **always** call the user's callback asynchronously—even if we finished instantly." That deferral mechanism became `process.nextTick`. It also became the **highest-priority** hook in the scheduler—powerful, easy to abuse, and a favorite interview topic because it sits outside the normal [event loop phases](./what-are-event-loop-phases.md).

## 2. The Analogy — Make It Obvious

Picture a **VIP express lane** at airport security.

Regular travelers (timers, I/O, `setImmediate`) wait in district lines for the next [event loop](./what-is-node-js-event-loop.md) phase. Promise travelers use a fast shuttle between districts.

`process.nextTick` is the **express lane that runs before the shuttle**—every time the current security booth clears one person (end of a phase or sync code), express lane passengers go **before** anyone else moves to the next district.

If express passengers keep cutting in line recursively ("I'm also express!"), regular travelers never board—planes (I/O callbacks, timers) wait forever. That is **nextTick starvation**.

## 3. How It Actually Works — The Full Explanation

`process.nextTick(callback)` schedules `callback` on the **nextTick queue**—not inside a libuv phase.

### When nextTick runs

After the current operation completes and before the event loop continues:

- After synchronous code finishes
- After each [event loop phase](./what-are-event-loop-phases.md) processes its callbacks
- Before Promise microtasks (in practice: nextTick queue drained first, then microtasks)

Node drains the entire nextTick queue. If a nextTick callback schedules another nextTick, the new one runs in the same drain—until the queue is empty **or** you recurse so deep Node warns.

### Not part of the event loop phases

Phases: timers → pending → idle → prepare → poll → check → close ([libuv](./what-is-libuv.md)).

`nextTick` is **between** phases—Node-specific, not a libuv phase ticket.

### Why Node uses it internally

Many core APIs guarantee async callbacks:

```js
function maybeSync(callback) {
  const result = 42; // imagine sometimes instant
  process.nextTick(() => callback(null, result));
}
```

Caller always sees async invocation—errors thrown in callback do not happen mid-caller's stack in the sync case.

### vs `setImmediate`

| | process.nextTick | setImmediate |
|--|------------------|--------------|
| Queue | nextTick queue | check phase |
| Runs | Before next phase, before Promises | After poll I/O in same turn |
| Starves I/O? | Yes, if abused | Less aggressive |
| Browser? | No | No (Node only) |

See [process.nextTick vs setImmediate](./process-nexttick-vs-setimmediate.md).

### vs Promise microtasks

Both run before timers and I/O phases continue, but **nextTick runs before Promise** microtasks. Order in one turn:

```txt
sync → nextTick → Promise → (phases...)
```

### Starvation

```js
function loop() {
  process.nextTick(loop);
}
loop();
```

Event loop may never reach poll or timers—network responses stall, `setTimeout` delays, `setImmediate` delays. Node may emit recursion warnings.

### Appropriate uses

- Ensuring async callback semantics in library code (like Node core)
- Deferring work to after caller completes without waiting for I/O (`nextTick` vs `setImmediate` trade-off)
- Rarely in app code—prefer `queueMicrotask` / Promises for cross-environment patterns, or `setImmediate` when I/O should proceed first

## 4. Real Code — See It Working

**Priority demo:**

```js
// nexttick-priority.js
console.log('1 sync');

process.nextTick(() => console.log('2 nextTick'));

Promise.resolve().then(() => console.log('3 promise'));

setTimeout(() => console.log('4 timeout'), 0);

console.log('5 sync');
```

Output:

```
1 sync
5 sync
2 nextTick
3 promise
4 timeout
```

**Async consistency pattern (library style):**

```js
function asyncAlways(value, cb) {
  // Even if value is ready now, callback is always async
  process.nextTick(() => cb(null, value));
}

console.log('before');
asyncAlways('data', (err, val) => console.log('callback', val));
console.log('after');
```

Output:

```
before
after
callback data
```

**Starvation (educational—do not ship):**

```js
// starvation.js
let n = 0;
function spin() {
  process.nextTick(() => {
    n += 1;
    if (n < 500000) spin();
  });
}
spin();

setTimeout(() => console.log('timer at', Date.now()), 0);
```

Timer prints noticeably later.

**Prefer setImmediate when I/O should breathe:**

```js
const fs = require('fs');

fs.readFile(__filename, () => {
  console.log('io done');
});

// Defer without starving poll follow-up as aggressively
setImmediate(() => console.log('immediate cleanup'));
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is `process.nextTick`?**

A Node API that schedules a callback to run after the current operation completes, before the event loop continues to the next phase and before Promise microtasks. It uses the nextTick queue—the highest-priority scheduling mechanism in Node.

**Q: When does `process.nextTick` run?**

After sync code and after each event loop phase's callbacks, during the nextTick/microtask drain between phases. Not inside timers, poll, or check phases themselves.

**Q: What is the execution order of nextTick, Promise, and setTimeout?**

Sync code → `process.nextTick` → Promise microtasks → event loop phases (timers includes `setTimeout`). `setImmediate` runs in check phase after poll I/O.

**Q: Why does Node use `process.nextTick` internally?**

To guarantee callbacks are always asynchronous, even when work completes synchronously—consistent error handling and no re-entrancy during caller execution.

**Q: What is nextTick starvation?**

Recursive or excessive `process.nextTick` scheduling prevents the event loop from advancing through phases—I/O, timers, and `setImmediate` stall. API latency spikes globally.

**Q: When should you use `setImmediate` instead of `process.nextTick`?**

When deferring work but allowing I/O and other phases to proceed in the current turn. `setImmediate` runs in check phase after poll—better for yielding under load. Use nextTick only when you need "before the next phase" semantics and accept the starvation risk.

**Q: Is `process.nextTick` available in the browser?**

No. Use `queueMicrotask` or `Promise.then` in browsers. Behavior is similar to microtasks, not identical to nextTick's ordering vs Promises in all edge cases across environments.

**Q: How do you detect nextTick starvation in production?**

Rising event loop lag (`perf_hooks.monitorEventLoopDelay`), delayed timers, growing nextTick queue (harder to observe directly), and Node warnings about nextTick recursion. Fix the scheduling pattern, not just the metric.

**Q: Does `nextTick` create a new thread?**

No. Same main thread—just earlier scheduling than other async work.

## 6. The Traps — What Goes Wrong

**Trap: Using `nextTick` in a tight loop "to avoid blocking."**

It blocks progression of the event loop more aggressively than chunking with `setImmediate` or workers.

**Trap: Assuming `nextTick` and `Promise.then` are equivalent.**

nextTick runs before Promise microtasks. Order-sensitive code breaks if you swap them.

**Trap: `nextTick` in browser bundles.**

Runtime error. Guard with `typeof process !== 'undefined' && process.nextTick`.

**Trap: Deferring CPU-heavy work with nextTick.**

Still runs on main thread—only changes **when**, not **how expensive**. Use worker threads for CPU.

**Trap: nextTick in Express middleware for "async" error handling without `next`.**

Can cause subtle ordering bugs; prefer `async` middleware with proper error wrappers.

**Trap: Ignoring starvation because "it's just one middleware."**

Under load, many requests scheduling nextTick piles up.

## 7. Compare With Related Concepts

| Mechanism | Runs when | Browser? |
|-----------|-----------|----------|
| **process.nextTick** | Before phases, before Promises | No |
| **Promise / queueMicrotask** | Microtasks between phases | Yes |
| **setTimeout(0)** | Timers phase | Yes |
| **setImmediate** | Check phase, after poll | No |
| **await** | Promise microtask continuation | Yes |

**Related pages:**

- [Node.js event loop](./what-is-node-js-event-loop.md)
- [Event loop phases](./what-are-event-loop-phases.md)
- [process.nextTick vs setImmediate](./process-nexttick-vs-setimmediate.md)
- [Microtask queue](./what-is-microtask-queue.md)
- [Browser vs Node loop](./browser-event-loop-vs-node-js-event-loop.md)

**nextTick vs [libuv](./what-is-libuv.md):** libuv owns phases; nextTick is Node's extra queue layered on top between phases.

**Rule:** nextTick = "run before anything else async continues"; setImmediate = "run after I/O this turn"; Promise = "standard async continuation."

## 8. 🧠 The Memory Hook — What Sticks

`process.nextTick` is the **VIP cut** in line—before Promises, before timers, before I/O phases get their next turn. Use it to keep callbacks **always async**; abuse it and VIPs never let the plane ([poll](./what-are-event-loop-phases.md) phase) leave the gate.
