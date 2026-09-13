# What is Node.js event loop

## 1. Why This Exists — The Problem First

You wrote async code. You used `Promise`, `setTimeout`, and `await`. It works in tests. In production, logs appear in a "wrong" order. A bug only shows up when two requests overlap. A `setImmediate` callback never seems to run because I/O never stops.

The confusion is not JavaScript syntax—it is **when** your callbacks actually run. Node.js does not run async code on new threads. It runs one JavaScript thread and a **scheduler** that decides which callback goes next when the current function finishes.

That scheduler is the **event loop**. Misunderstand it and you mis-debug concurrency, starve I/O, or block every user with one synchronous loop.

## 2. The Analogy — Make It Obvious

Picture a **conveyor belt with inspection stations** (phases).

A worker (V8) stands at the belt and can only handle **one box at a time** (one call stack frame). When the worker's hands are empty (stack empty), they look at the next station:

- **Timers station** — boxes labeled "run after 5 seconds"
- **Poll station** — boxes from trucks that just arrived (network data, finished disk reads)
- **Check station** — boxes labeled "run after I/O this turn"

Between stations, a **priority cart** rolls through: first [process.nextTick](./what-is-process-nexttick.md) boxes, then Promise boxes (microtasks). Those carts run **between every station**—before the worker moves to the next phase.

The belt keeps moving as long as there are boxes, timers, or trucks expected. When everything is idle and no I/O is pending, the process can exit.

The event loop is not "a queue." It is this **round of stations**, with microtasks interrupting between stations.

## 3. How It Actually Works — The Full Explanation

The Node.js event loop is implemented by [libuv](./what-is-libuv.md). It coordinates:

- The **call stack** (synchronous JavaScript V8 is executing)
- **Microtask queues** (`process.nextTick`, then Promises)
- **Phase queues** (timers, I/O, `setImmediate`, close callbacks)

See [event loop phases](./what-are-event-loop-phases.md) for the full phase list.

### Basic algorithm

1. Run synchronous code until the call stack is empty.
2. Drain **all** `process.nextTick` callbacks (if any schedule more, drain again—dangerous if recursive).
3. Drain **all** Promise microtasks (`.then`, `await` continuations).
4. Enter the next event loop phase; run callbacks in that phase's queue until empty or phase-specific limits.
5. After each phase, repeat steps 2–3 (microtasks between phases).
6. Repeat until no work remains.

### Call stack vs callback queues

When you call `setTimeout(fn, 0)`, `fn` is **not** run immediately. It is registered for a future timers phase. When you `await fetch(...)`, the continuation after await is a microtask.

The event loop's job: whenever the stack clears, feed it the next callback according to priority rules.

### Single-threaded JavaScript

All your route handlers, middleware, and `console.log` in callbacks run on **one thread**. Long CPU work in any callback delays every other callback—there is no fair per-request threading.

I/O waiting does not occupy that thread; [non-blocking I/O](./what-is-non-blocking-i-o.md) delegates waiting to libuv/OS.

### Relationship to `async/await`

`async function` returns a Promise. `await` suspends the function and schedules the rest as a microtask when the awaited Promise settles. Other event loop work can run during the wait.

### When the process exits

`process.exit()` forces exit. Otherwise Node stays alive while:

- Active handles (servers, open sockets, timers) exist
- libuv expects I/O
- Ref'd timers/intervals are pending

### Event loop lag

If synchronous code runs too long, the loop cannot advance phases promptly—**lag** increases. Monitor with `perf_hooks.monitorEventLoopDelay()`. This is the top Node-specific health metric.

## 4. Real Code — See It Working

**Classic ordering demo:**

```js
// loop-order.js
console.log('sync 1');

setTimeout(() => console.log('timeout'), 0);

setImmediate(() => console.log('immediate'));

Promise.resolve().then(() => console.log('promise'));

process.nextTick(() => console.log('nextTick'));

console.log('sync 2');
```

Output:

```
sync 1
sync 2
nextTick
promise
timeout
immediate
```

**Microtask starvation (do not do this in production):**

```js
// starvation.js
let count = 0;
function spin() {
  process.nextTick(() => {
    count += 1;
    if (count < 1_000_000) spin();
  });
}
spin();

setTimeout(() => console.log('timer finally'), 0);
// timer may be very delayed — nextTick queue never lets phases advance cleanly
```

**Event loop delay monitor:**

```js
// loop-delay.js
const { monitorEventLoopDelay } = require('perf_hooks');
const h = monitorEventLoopDelay({ resolution: 10 });
h.enable();

setInterval(() => {
  console.log('p99 ms', (h.percentile(99) / 1e6).toFixed(2));
  h.reset();
}, 1000);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the Node.js event loop?**

A single-threaded scheduling mechanism that runs callbacks when the JavaScript call stack is empty. libuv drives it through phases (timers, poll, check, etc.). Between phases, `process.nextTick` and Promise microtasks run. It enables non-blocking I/O: while waiting on network or disk, other callbacks execute.

**Q: What is the execution order of `setTimeout`, `setImmediate`, and `Promise`?**

Sync code first. Then `process.nextTick` (if any). Then Promise microtasks. Then timers phase (`setTimeout`). Then I/O callbacks in poll. Then `setImmediate` in check phase. Exact order varies with context—inside an I/O callback, `setImmediate` can run before the next `setTimeout`. See [phases](./what-are-event-loop-phases.md).

**Q: What blocks the event loop?**

Synchronous CPU work: loops, sync file I/O, large `JSON.parse`, regex on huge input, `bcrypt.hashSync`. Also infinite `while` loops and recursive `process.nextTick`. See [blocking code](./what-is-blocking-code.md).

**Q: What is event loop lag and what is a healthy target?**

Time between event loop iterations. Under load, p99 under ~100ms is a common healthy target for API servers; tighter for real-time. Spikes mean something blocked the main thread.

**Q: What is microtask starvation?**

Scheduling microtasks (`nextTick` or Promise chains) faster than the loop advances phases. I/O callbacks and timers wait. Recursive `process.nextTick` is the classic starvation pattern.

**Q: Does `setTimeout` guarantee exact timing?**

No. It guarantees **at least** the delay. Busy poll phases, long sync code, or many timers push actual execution later.

**Q: How is the event loop different in the browser?**

Browser has macrotasks/microtasks and **rendering** between turns. Node has libuv phases, `setImmediate`, `process.nextTick`, and a thread pool. See [Browser vs Node event loop](./browser-event-loop-vs-node-js-event-loop.md).

**Q: Why does the event loop matter for APIs?**

Every request handler shares one loop. One blocked handler blocks health checks, WebSockets, and logging. Non-blocking I/O only helps if you do not block the thread while handling results.

## 6. The Traps — What Goes Wrong

**Trap: "The event loop is just a callback queue."**

Queues exist per phase, plus separate microtask queues. Order is phase-driven, not FIFO globally.

**Trap: Assuming `setTimeout(fn, 0)` runs before `setImmediate(fn)` always.**

In the main module, often `setTimeout` then `setImmediate`. Inside I/O callbacks, often reversed on the next turn.

**Trap: Recursive `process.nextTick` for "better performance."**

It starves I/O and timers—worse performance for the whole server.

**Trap: `async` functions cannot block.**

They block if the body contains sync CPU work or `await` on nothing async. `await` does not offload CPU.

**Trap: Unhandled rejections.**

Async errors skip try/catch unless awaited or `.catch()`. Modern Node exits on unhandled rejections by default.

**Trap: Ignoring lag metrics.**

Average response time looks fine while p99 dies because occasional sync work stalls the loop.

## 7. Compare With Related Concepts

| Concept | Relationship |
|---------|--------------|
| [libuv](./what-is-libuv.md) | Implements the loop and I/O |
| [Event loop phases](./what-are-event-loop-phases.md) | Stations on the belt |
| [process.nextTick](./what-is-process-nexttick.md) | Highest-priority scheduling, between phases |
| [setImmediate](./what-is-setimmediate.md) | Check phase scheduling |
| [Microtask queue](./what-is-microtask-queue.md) | Promise/`queueMicrotask` queue |
| [Callback queue](./what-is-callback-queue.md) | Macrotask/phase queues |

**Event loop vs threads:** Loop multiplexes many connections on one JS thread; threads run code in parallel. Node uses both—one JS thread plus libuv pool and optional workers.

**Rule:** If stack is busy, loop is stuck. If stack is empty but responses slow, check I/O, pool saturation, or microtask floods.

## 8. 🧠 The Memory Hook — What Sticks

The event loop is **one worker** who only picks up the next box when their hands are empty: first the express cart ([nextTick](./what-is-process-nexttick.md)), then Promise notes, then each **station** (timers → I/O → immediate). If the worker spends ten seconds inspecting one box (sync CPU), every station behind them freezes.
