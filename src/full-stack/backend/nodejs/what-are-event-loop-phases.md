# What are event loop phases

## 1. Why This Exists — The Problem First

You scheduled cleanup with `setImmediate` and logging with `setTimeout(fn, 0)`. You expected cleanup first. Instead, logs sometimes run first—or the opposite, depending on whether the code ran at startup or inside a `fs.readFile` callback.

You did not do anything "wrong" with Promises. You hit **phase ordering**: Node's event loop is not one queue. It is a fixed tour of stations. Callbacks land in different stations depending on how they were scheduled. Interviewers love this because it separates people who memorized "async magic" from people who know [how Node actually works](./how-does-node-js-work.md).

## 2. The Analogy — Make It Obvious

Imagine a **train that must visit six stations every lap**, in order, no skipping.

1. **Timers Station** — passengers whose watches say "depart now" (`setTimeout`, `setInterval`).
2. **Pending Station** — passengers deferred from last lap's system issues.
3. **Idle / Prepare** — rail company internal checks (you rarely book tickets here).
4. **Poll Station** — the busy platform where freight arrives (network packets, completed disk reads). The train may **wait here** if no freight is ready but shipments are expected.
5. **Check Station** — passengers holding "run after freight" tickets (`setImmediate`).
6. **Close Station** — passengers leaving the train (`socket.on('close')`, etc.).

Between **every** station, a **shuttle bus** runs first: all [process.nextTick](./what-is-process-nexttick.md) passengers, then all Promise passengers (microtasks). The train cannot leave for the next station until the shuttle finishes its rounds.

Your callback's **ticket type** determines which station it boards—not when you shouted for it.

## 3. How It Actually Works — The Full Explanation

[libuv](./what-is-libuv.md) implements these phases. The [Node.js event loop](./what-is-node-js-event-loop.md) is this phased cycle plus microtasks between phases.

### Phase 1: Timers

Executes callbacks for timers whose threshold expired. `setTimeout(fn, 100)` and `setInterval` live here.

Important: **minimum delay**, not exact. If poll or sync code runs long, timer fires late.

### Phase 2: Pending callbacks

Runs some deferred system callbacks (e.g. certain TCP errors reported as `ECONNRESET`). You rarely schedule work here directly.

### Phase 3: Idle / Prepare

Internal libuv housekeeping. Application code does not schedule here.

### Phase 4: Poll

The workhorse phase:

- Retrieves new I/O events
- Executes I/O callbacks (network data ready, `fs.readFile` completion, etc.)
- **May block** waiting for I/O if no timers are ready and libuv expects events

If poll is continuously busy (flood of I/O), later phases in the same iteration may delay—**check starvation** for `setImmediate`.

### Phase 5: Check

Runs `setImmediate` callbacks. Designed to run **after** poll I/O in the same loop turn.

### Phase 6: Close callbacks

Runs close callbacks like `socket.on('close')`.

### Microtasks between phases

After each phase completes:

1. Drain entire `nextTickQueue` (can recurse—dangerous)
2. Drain Promise microtasks until empty

Then advance to next phase.

### The famous `setTimeout` vs `setImmediate` puzzle

**Outside I/O (main module):**

Often timers phase runs before check phase in the first iteration → `setTimeout` before `setImmediate`.

**Inside I/O callback (already in poll):**

Timers phase for this turn already passed → next lap starts with timers → but `setImmediate` in check phase of **current** turn may run before next timer.

Hence inside `fs.readFile` callback:

```txt
setImmediate (check, same turn) often before setTimeout (timers, next turn)
```

### Poll blocking behavior

Poll waits for I/O when appropriate. That is good for efficiency but means timer precision and `setImmediate` timing interact with I/O load.

## 4. Real Code — See It Working

**Main module vs inside I/O:**

```js
// phases-demo.js
const fs = require('fs');

setTimeout(() => console.log('main: timeout'), 0);
setImmediate(() => console.log('main: immediate'));

fs.readFile(__filename, () => {
  console.log('--- inside I/O ---');
  setTimeout(() => console.log('io: timeout'), 0);
  setImmediate(() => console.log('io: immediate'));
});
```

Typical output:

```
main: timeout
main: immediate
--- inside I/O ---
io: immediate
io: timeout
```

**Microtasks between phases:**

```js
const fs = require('fs');

setTimeout(() => {
  console.log('timer');
  Promise.resolve().then(() => console.log('promise inside timer'));
}, 0);

fs.readFile(__filename, () => {
  console.log('io');
});

Promise.resolve().then(() => console.log('promise'));
```

Shows microtasks interleaved as phases progress.

**setImmediate starvation sketch (heavy I/O):**

```js
const fs = require('fs');

setImmediate(() => console.log('immediate ran'));

for (let i = 0; i < 20; i++) {
  fs.readFile(__filename, () => {
    // many I/O callbacks keep poll busy
  });
}
```

If I/O never pauses, `immediate ran` may print late—all poll work first in each iteration.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are the six phases of the Node.js event loop?**

Timers → pending callbacks → idle/prepare → poll → check → close callbacks. Microtasks (`nextTick`, then Promises) run between phases. Implemented by libuv; see [What is libuv](./what-is-libuv.md).

**Q: In which phase do `setTimeout` callbacks run?**

Timers phase—the first phase of each iteration (when their delay has elapsed).

**Q: In which phase do `setImmediate` callbacks run?**

Check phase—after poll I/O callbacks in the same loop turn.

**Q: Why does `setTimeout` run before `setImmediate` in the main module?**

First iteration: timers phase comes before check phase. Both may be scheduled at startup; timer fires in timers, immediate in check.

**Q: Why does `setImmediate` run before `setTimeout` inside an I/O callback?**

The I/O callback runs in poll phase. Check phase still runs later in the **same** turn (immediate). `setTimeout(0)` waits for the **next** timers phase—next iteration—so immediate often wins.

**Q: What is poll phase starvation?**

Continuous I/O keeps poll busy; check phase (`setImmediate`) delays. Deferred work scheduled with `setImmediate` piles up.

**Q: When are microtasks processed?**

Between phases—after each phase's callbacks, before the next phase. `process.nextTick` runs before Promise microtasks.

**Q: Should application logic rely on phase ordering?**

No for business correctness. Phases explain debugging and interview questions—not stable contracts for app behavior. For guaranteed order, chain explicitly (`await`, queues, job processors).

**Q: What is the most important phase for API servers?**

Poll—most incoming HTTP data and completed async I/O fire here. Timers drive timeouts; check runs `setImmediate`; close handles connection cleanup.

## 6. The Traps — What Goes Wrong

**Trap: Building logic on "setImmediate always after setTimeout."**

Context-dependent. Classic interview trap; wrong in production assumptions.

**Trap: Using `setImmediate` for user-facing ordering guarantees.**

Use explicit state machines or queues. Phase order is an implementation detail for app logic.

**Trap: Recursive `process.nextTick` between phases.**

Prevents advancing phases—timers and I/O starve.

**Trap: Assuming timer fires exactly on schedule.**

Event loop load shifts timers. Use monotonic deadlines for critical timing, not `setTimeout` precision.

**Trap: Ignoring poll blocking during benchmarks.**

Idle server vs flood of uploads changes when check phase runs—benchmarks must match production I/O patterns.

**Trap: Confusing browser phases with Node phases.**

Browser has no check phase or libuv poll. See [Browser vs Node event loop](./browser-event-loop-vs-node-js-event-loop.md).

## 7. Compare With Related Concepts

| Concept | Role |
|---------|------|
| [Event loop](./what-is-node-js-event-loop.md) | Whole scheduling model |
| [libuv](./what-is-libuv.md) | Implements phases |
| [process.nextTick](./what-is-process-nexttick.md) | Between phases, not in a phase |
| [setImmediate](./what-is-setimmediate.md) | Check phase |
| [Microtask queue](./what-is-microtask-queue.md) | Promises between phases |
| [Callback queue](./what-is-callback-queue.md) | Phase/macrotask queues |

**Phases vs microtasks:** Phases are libuv's tour; microtasks are Node's extra shuttle between stations. `nextTick` beats Promises on the shuttle.

**Phases vs [browser event loop](./browser-event-loop-vs-node-js-event-loop.md):** Browser = one macrotask + all microtasks + render. Node = six macrotask-like phases + microtasks between each.

**Rule:** Know which **ticket** your callback used—timer, I/O/poll, immediate/check, close, nextTick, Promise.

## 8. 🧠 The Memory Hook — What Sticks

The event loop is a **train with six mandatory stops**; `setTimeout` boards at **Timers**, finished disk/network work exits at **Poll**, `setImmediate` boards at **Check**—and a **shuttle bus** ([nextTick](./what-is-process-nexttick.md) then Promises) runs between every stop. Inside Poll station, Check still comes later **this lap**; Timers is **next lap**—that's why immediate beats timeout in I/O callbacks.
