# process.nextTick vs setImmediate

## 1. Why This Exists — The Problem First

Two APIs both say "run this later." You pick one, drop it in a hot path, and production slows to a crawl — or worse, requests time out while a recursive scheduler hogs the thread. The bug report says "async code," but the real issue is **which** deferral mechanism you used.

Node.js gives you `process.nextTick` and `setImmediate` because they solve different problems. Treat them as interchangeable and you either starve I/O (too much `nextTick`) or add unnecessary delay (using `setImmediate` when you needed immediate-before-next-phase semantics). Interviews test whether you know the priority ladder, not just the names.

## 2. The Analogy — Make It Obvious

Imagine a hospital triage desk and a scheduled clinic.

**`process.nextTick`** is the triage nurse who pulls you aside *before* anyone else moves — even before the VIP lounge (microtasks/Promises) opens for the next group. If the nurse keeps calling "one more urgent case" recursively, the clinic never opens its doors to scheduled patients (I/O, timers, `setImmediate`).

**`setImmediate`** is the clinic appointment block that runs *after* today's walk-ins (poll-phase I/O) are handled, but before tomorrow's timer-driven appointments. You wait your turn in the normal schedule; you do not cut in front of triage or VIPs.

Same building, different queues, different starvation risk.

## 3. How It Actually Works — The Full Explanation

Node.js priority from highest to lowest:

1. **Synchronous code** on the call stack
2. **`process.nextTick` queue** — not a libuv phase; Node drains this queue completely before continuing the event loop
3. **Microtask queue** — Promises (`then/catch/finally`), `queueMicrotask()`
4. **Event loop phases** — timers, pending, poll, **check (`setImmediate`)**, close callbacks

`process.nextTick(fn)` runs `fn` after the current operation completes, but **before** the event loop moves to the next phase. If a `nextTick` callback schedules another `nextTick`, the loop never reaches poll — I/O callbacks, timers, and `setImmediate` all wait. That is **event loop starvation**.

`setImmediate(fn)` enqueues `fn` in the **check** phase of the **current or next** iteration (after poll I/O). Between check callbacks, the loop can process I/O and timers. Recursive `setImmediate` yields; the server stays responsive (though individual chunks may still be slow).

Common uses:

- **`process.nextTick`:** Ensure a callback is always async (`cb` must not run synchronously). Propagate errors in sync-looking APIs. One-shot deferral where you must run before Promise reactions.
- **`setImmediate`:** Break up CPU work on the main thread. Defer after I/O without blocking poll. Repeated deferral where I/O must breathe.

Both are Node.js-only.

## 4. Real Code — See It Working

**Priority demo — run with `node`:**

```js
console.log("start");

process.nextTick(() => console.log("nextTick"));
setImmediate(() => console.log("setImmediate"));
Promise.resolve().then(() => console.log("promise"));

console.log("end");

// Output order:
// start
// end
// nextTick
// promise
// setImmediate
```

**Starvation: recursive `nextTick` blocks `setImmediate`:**

```js
let nextTickCount = 0;

process.nextTick(function loop() {
  nextTickCount++;
  if (nextTickCount < 3) {
    process.nextTick(loop);
  } else {
    console.log("nextTick done");
  }
});

setImmediate(() => console.log("setImmediate finally runs"));

// nextTick done
// setImmediate finally runs
// (If you remove the stop condition, setImmediate never runs.)
```

**Safe chunking with `setImmediate`:**

```js
function heavyWork(total, chunkSize, done) {
  let i = 0;

  function step() {
    const end = Math.min(i + chunkSize, total);
    for (; i < end; i++) {
      // simulate work
    }

    if (i < total) {
      setImmediate(step); // WHY: allows poll phase between chunks
    } else {
      done();
    }
  }

  step();
}

heavyWork(1_000_000, 100_000, () => console.log("finished without starving I/O"));
```

**Classic async API pattern with `nextTick`:**

```js
function asyncStyle(callback) {
  try {
    const result = 42;
    // WHY: callback must not run synchronously — callers rely on async ordering
    process.nextTick(() => callback(null, result));
  } catch (err) {
    process.nextTick(() => callback(err));
  }
}

asyncStyle((err, value) => console.log(value)); // 42
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the difference between `process.nextTick` and `setImmediate`?**

`process.nextTick` runs before the event loop continues — highest priority, outside normal phases. `setImmediate` runs in the check phase after poll I/O. `nextTick` beats Promises; Promises beat `setImmediate`.

**Q: Which has higher priority?**

`process.nextTick` > microtasks (Promises) > `setImmediate` / phase callbacks.

**Q: Can `process.nextTick` starve the event loop?**

Yes. Recursive or high-volume `nextTick` scheduling prevents the loop from advancing to poll, timers, and check. I/O callbacks pile up; latency spikes. `setImmediate` in a loop does not cause the same starvation pattern because each iteration completes a full phase cycle.

**Q: When should you use each?**

Use `process.nextTick` sparingly for one-shot "must be async" semantics or error deferral in sync-style APIs. Use `setImmediate` for repeated deferral, post-I/O work, or CPU chunking on the main thread. Use worker threads when CPU work is heavy enough to need a separate core.

**Q: Are they available in the browser?**

No. Both are Node.js APIs. In shared code, use `queueMicrotask()` (microtask priority, closer to `nextTick` than `setImmediate`) or `setTimeout(fn, 0)` for coarse deferral.

## 6. The Traps — What Goes Wrong

**Trap: Recursive `process.nextTick` in a loop.** The most common production foot-gun. Looks innocent; blocks all I/O. Replace with `setImmediate` or workers.

**Trap: Assuming `setImmediate` is faster because the name sounds weaker.** It runs later by design. Choosing it when you needed `nextTick` semantics breaks ordering assumptions in libraries.

**Trap: Thinking Promises and `nextTick` are equivalent.** Promises run after the entire `nextTick` queue drains. Libraries that depend on `nextTick`-first ordering can break if you swap in bare Promises.

**Trap: `async function` wrapping sync blocking work.** `async` does not move sync I/O off the thread. `async () => fs.readFileSync(...)` still blocks — neither API helps until you use real async I/O or workers.

## 7. Compare With Related Concepts

| API | Queue / phase | Starvation risk | Typical use |
|---|---|---|---|
| `process.nextTick` | Pre-phase tick queue | High if recursive | Async callback guarantee |
| `queueMicrotask` | Microtask | High if recursive | Cross-env microtasks |
| Promise `.then` | Microtask | High if recursive chains | Async composition |
| `setImmediate` | Check phase | Low for chunking | Post-I/O deferral, chunk CPU |
| `setTimeout(0)` | Timers phase | Low | Portable deferral |

**One-line rule:** `nextTick` = cut the line once; `setImmediate` = wait for the next scheduled clinic after walk-ins.

## 8. 🧠 The Memory Hook — What Sticks

`process.nextTick` jumps the queue before the loop moves; `setImmediate` waits for the check phase after I/O. `nextTick` first, then Promises, then `setImmediate` — and only `nextTick` can starve the whole hospital if you keep calling "one more urgent case."
