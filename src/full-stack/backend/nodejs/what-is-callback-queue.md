# What is callback queue

## 1. Why This Exists — The Problem First

Your API logs show callbacks firing in a order that makes no sense: the timer you scheduled last runs before the I/O callback you registered first. You add `console.log` everywhere and still cannot explain it. The bug is not "async is random" — you are picturing **one** waiting line when Node.js actually runs **several**, one per event loop phase.

The callback queue (more precisely, **queues**) is how Node.js remembers "run this JavaScript when the current stack clears." Without that model, you cannot predict latency, debug ordering bugs, or explain why a flooded server stops answering health checks.

## 2. The Analogy — Make It Obvious

Think of an airport with separate boarding queues — not one giant line.

- **Timers queue:** passengers with scheduled departures (`setTimeout`, `setInterval`)
- **Poll queue:** passengers whose flights just landed (completed network/file I/O)
- **Check queue:** passengers doing final gate checks (`setImmediate`)
- **Close queue:** last-minute cleanup when a connection shuts down

The gate agent (event loop) walks the terminal in a fixed route each round: timers building → pending → poll → check → close. Passengers only board when their building is open **and** the agent is free (call stack empty).

There is also a **VIP express lane** (microtasks and `process.nextTick`) that runs between buildings — not part of the regular boarding queues, but it always cuts in first.

## 3. How It Actually Works — The Full Explanation

When async work completes — a timer fires, a socket receives data, a file read finishes — libuv places the associated JavaScript callback into the queue for that **phase**. The event loop:

1. Runs synchronous code until the call stack is empty
2. Drains `process.nextTick` completely
3. Drains the microtask queue completely (including newly scheduled microtasks)
4. Enters a phase, runs **all ready callbacks in that phase's queue** (up to system limits)
5. Repeats for the next phase

Each phase queue is **FIFO** within itself. Ordering across phases follows the loop's fixed sequence, **not** the order you called `setTimeout` vs `fs.readFile` in source code.

Important distinctions:

- **"Callback queue" in interviews** often means macrotasks / task queues (timers, I/O, check). Node splits them by phase instead of one browser-style queue.
- **Microtasks are separate.** Promises and `queueMicrotask` are not in the timers or poll queues.
- **Call stack vs queues:** Queues hold work *waiting*; only one callback runs on the stack at a time.
- **Backpressure on the queues:** If callbacks run slowly or arrive faster than they execute, queues grow — latency rises, memory pressure increases, timeouts follow.

When people say "the event loop is blocked," they mean nothing is draining these queues because synchronous JavaScript still occupies the thread.

## 4. Real Code — See It Working

**Different APIs → different phase queues:**

```js
const fs = require("fs");

console.log("sync start");

setTimeout(() => console.log("timers phase"), 0);

fs.readFile(__filename, () => {
  console.log("poll phase (I/O callback)");
});

setImmediate(() => console.log("check phase"));

Promise.resolve().then(() => console.log("microtask (between phases)"));

console.log("sync end");

// Typical order:
// sync start
// sync end
// microtask (between phases)
// timers phase
// poll phase (I/O callback)
// check phase
// (Exact timer vs poll order can vary slightly on first tick; microtasks always before phase callbacks.)
```

**Scheduling order ≠ execution order:**

```js
setImmediate(() => console.log("immediate"));
setTimeout(() => console.log("timeout"), 0);

// You might expect registration order; phases decide execution order.
```

**Why queue depth matters under load:**

```js
const { performance } = require("perf_hooks");

const start = performance.now();
let completed = 0;
const total = 5000;

for (let i = 0; i < total; i++) {
  setImmediate(() => {
    completed++;
    if (completed === total) {
      console.log(`drained ${total} check-queue callbacks in ${(performance.now() - start).toFixed(1)}ms`);
    }
  });
}

// WHY: each callback waits in the check queue until earlier phases and callbacks finish
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the callback queue in Node.js?**

It is the set of queues holding callbacks waiting for the event loop. Each phase (timers, poll, check, close, etc.) has its own FIFO queue. When async work completes, its callback is enqueued; when the loop reaches that phase and the stack is empty, callbacks run.

**Q: How many callback queues does Node have?**

Multiple macrotask queues — one per event loop phase — plus separate microtask and `nextTick` queues. There is not a single universal "callback queue."

**Q: Do callbacks run in the order they were scheduled?**

Not globally. They run in **phase order** first, then FIFO within a phase. A `setTimeout(0)` and a completed I/O callback may reorder relative to registration depending on which phase the loop is in.

**Q: What happens when queues get too long?**

Latency increases (callbacks wait longer before running), memory grows with pending closures, and clients see slow responses or timeouts. Long poll queues often mean slow I/O handlers; long timer queues mean delayed scheduled work.

**Q: How do microtasks relate to callback queues?**

Microtasks are higher priority. After each phase (and after sync code), Node drains microtasks before moving to the next phase. They are not stored in the timers/poll/check queues.

## 6. The Traps — What Goes Wrong

**Trap: One queue mental model from browser tutorials.** Browsers often describe a single task queue + microtasks. Node's per-phase queues explain `setImmediate` vs `setTimeout` behavior better.

**Trap: Assuming registration order equals run order.** Classic interview mistake. Draw phases first.

**Trap: Ignoring microtask priority.** A Promise chain scheduled during a timer callback runs before the next phase callback from another queue.

**Trap: Slow callbacks blocking queue drainage.** One 2-second handler in the poll phase delays every other poll callback behind it — and delays reaching check/timers until it finishes.

**Trap: Measuring "queue length" as one number in production.** Per-phase latency and event loop lag tell you *which* lane is backed up; a single counter rarely does.

## 7. Compare With Related Concepts

| Concept | What it holds | Priority |
|---|---|---|
| Call stack | Currently executing sync code | Runs now |
| `nextTick` queue | `process.nextTick` callbacks | Highest deferral |
| Microtask queue | Promises, `queueMicrotask` | After nextTick, before phases |
| Phase queues (timers, poll, check…) | `setTimeout`, I/O, `setImmediate`, etc. | Phase order |
| libuv thread pool queue | Pending thread-pool work (fs, crypto, dns) | Feeds poll callbacks when done |

**Rule:** Microtasks and `nextTick` are not "in the callback queue" — they run between phases with higher priority.

## 8. 🧠 The Memory Hook — What Sticks

Node does not have one callback line — it has **phase queues** (timers, poll, check…) visited in a fixed loop, with **microtasks cutting in between every stop**. Predict order by phase first, registration second.
