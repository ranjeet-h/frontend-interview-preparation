# What is microtask queue

## 1. Why This Exists — The Problem First

You chain three `.then()` handlers and expect the next `setTimeout` to run between them. It does not. Or you `await` a Promise and wonder why the UI thread still paints before your reaction runs — in Node, why a file read callback waits while ten Promise reactions finish first.

Promises gave JavaScript a standard async contract, but the runtime needed a place to run those reactions **soon** and **in order** without waiting for the next timer or I/O phase. That place is the **microtask queue**. Misunderstand it and you mis-predict execution order, miss starvation bugs, and ship subtle race conditions in middleware and frameworks.

## 2. The Analogy — Make It Obvious

Picture the airport again, but now a **VIP lounge between terminals**.

Regular passengers (timers, I/O, `setImmediate`) wait in phase-specific lines. VIPs (Promise reactions, `queueMicrotask`) do not enter those lines. After each terminal gate closes for the round, **every VIP already inside the lounge boards before anyone moves to the next terminal** — and if a VIP's paperwork spawns another VIP, that newcomer boards in the same round too.

`process.nextTick` is an even smaller express desk **before** the VIP lounge opens — handled first, every time.

The lounge must empty completely before the event loop advances to the next phase. That is why microtasks feel "immediate" compared to `setTimeout`, but still after synchronous code.

## 3. How It Actually Works — The Full Explanation

The microtask queue holds jobs from:

- `Promise.prototype.then`, `catch`, `finally`
- `queueMicrotask(fn)`
- (In browsers) `MutationObserver`; not relevant in typical Node server code

After the current synchronous execution finishes (and after Node drains the `process.nextTick` queue), the runtime runs **all** microtasks. If a microtask schedules another microtask, the new job runs in the **same draining cycle** before the event loop moves on. The queue must be empty before the next event loop phase starts.

Priority ladder in Node:

1. Sync call stack
2. `process.nextTick` queue (drained fully)
3. **Microtask queue (drained fully)**
4. Event loop phase callbacks (timers → … → poll → check → close)

This is why:

```js
Promise.resolve().then(() => console.log("promise"));
setTimeout(() => console.log("timeout"), 0);
```

logs `promise` before `timeout` — microtasks run before the timers phase.

**Starvation:** A microtask that schedules another microtask in a loop (`queueMicrotask(loop)` or `Promise.resolve().then(loop)`) prevents the loop from reaching poll. I/O and timers stall — same class of bug as recursive `process.nextTick`, though `nextTick` still wins priority when both are used.

**Unhandled rejections:** In Node 15+, an unhandled Promise rejection can terminate the process by default. Microtasks are where rejections surface if nothing catches them.

## 4. Real Code — See It Working

**Microtasks before macrotasks:**

```js
console.log("1 sync");

setTimeout(() => console.log("4 timeout"), 0);

Promise.resolve()
  .then(() => console.log("2 promise"))
  .then(() => console.log("3 chained promise"));

console.log("1 sync end");

// 1 sync
// 1 sync end
// 2 promise
// 3 chained promise
// 4 timeout
```

**`nextTick` before microtasks:**

```js
process.nextTick(() => console.log("nextTick"));
Promise.resolve().then(() => console.log("promise"));
// nextTick
// promise
```

**Recursive microtasks starve I/O (demo — do not run unbounded in prod):**

```js
let count = 0;

function microtaskLoop() {
  count++;
  if (count < 5) {
    queueMicrotask(microtaskLoop);
  } else {
    console.log("microtasks done");
  }
}

queueMicrotask(microtaskLoop);

setImmediate(() => console.log("setImmediate runs after microtasks drain"));

// microtasks done
// setImmediate runs after microtasks drain
```

**`await` is microtask scheduling:**

```js
async function demo() {
  console.log("A");
  await null; // WHY: resumes via microtask after sync code in demo() finishes
  console.log("C");
}

demo();
console.log("B");

// A
// B
// C
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the microtask queue and what goes in it?**

It holds Promise reaction jobs and `queueMicrotask` callbacks. They run after the current synchronous code and `process.nextTick` work, and before the event loop's next phase callback.

**Q: What is the execution order of `nextTick`, microtasks, and phase callbacks?**

`process.nextTick` → microtasks (fully drained) → event loop phases (timers, I/O, check, etc.).

**Q: Can microtasks starve the event loop?**

Yes. Recursive microtask scheduling keeps the runtime draining microtasks and never advancing to poll. Network I/O callbacks and timers wait. Fix: break the chain, use `setImmediate`, or move work to workers.

**Q: What happens to microtasks scheduled during a phase?**

They run after the current phase callback finishes (when the stack clears), before the next phase begins — still in the microtask-draining step between phases.

**Q: What about unhandled Promise rejections?**

They are reported when the rejection microtask runs. Uncaught, they can crash Node 15+ or trigger `unhandledRejection` handlers. Always attach `.catch` or use try/catch with `await`.

## 6. The Traps — What Goes Wrong

**Trap: Equating microtasks with `process.nextTick`.** `nextTick` runs first and can starve microtasks if abused. Libraries like Express historically relied on `nextTick` ordering.

**Trap: Assuming `setTimeout(0)` runs before `.then`.** It does not. Microtasks always win over timers in the same turn.

**Trap: Long Promise chains on the hot path.** Each `.then` is a microtask. A thousand-step chain adds a thousand microtask rounds before I/O — measurable latency.

**Trap: Forgetting that `async/await` resumes via microtasks.** Code after `await` runs as a microtask, which affects ordering with `setImmediate` and I/O.

**Trap: Unhandled rejections in fire-and-forget Promises.** `doWork()` without `await` or `.catch()` can take down the process.

## 7. Compare With Related Concepts

| Mechanism | Queue | Runs when | Starvation risk |
|---|---|---|---|
| `process.nextTick` | nextTick | Before microtasks | High |
| Microtask | microtask | After nextTick, before phases | High if recursive |
| `setImmediate` | check phase | After poll I/O | Lower for chunking |
| `setTimeout` | timers phase | Next timers phase | Lower |

**Browser vs Node:** Both have microtasks for Promises. Node adds `process.nextTick` ahead of them; browsers use `queueMicrotask` as the portable microtask API.

**Rule:** Promise reactions and `await` continuations are microtasks — they run before timers and I/O phase callbacks in the same loop turn.

## 8. 🧠 The Memory Hook — What Sticks

The microtask queue is the **VIP lounge that must empty completely** between event loop phases — Promises, `queueMicrotask`, and `await` resumes all live there, after `nextTick` but before timers and I/O callbacks.
