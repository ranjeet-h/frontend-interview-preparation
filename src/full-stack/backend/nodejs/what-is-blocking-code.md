# What is blocking code

## 1. Why This Exists — The Problem First

Production looks fine at low traffic. You deploy, traffic doubles, and suddenly every endpoint hangs — health checks fail, WebSockets stall, and p99 latency spikes while CPU sits oddly low. One route runs a "quick" synchronous file read or a tight loop "just to normalize data," and the entire Node process turns into a single-lane road with a parked truck in the middle.

**Blocking code** is any synchronous work on the main JavaScript thread that prevents the event loop from running other callbacks. In Node, that is not an optimization concern — it is an outage mechanism, because one thread serves everyone.

## 2. The Analogy — Make It Obvious

Node's event loop is a **single-lane bridge**. Every callback — HTTP response, timer, WebSocket ping, completed file read — must cross that bridge one at a time.

Blocking code is a breakdown in the middle of the bridge. Nothing else crosses until the tow truck finishes. It does not matter that other cars (requests) arrived first or that their drivers are urgent. One stalled vehicle stops all traffic.

Non-blocking code lets cars queue on the approach and cross as soon as the bridge clears; blocking code occupies the bridge during the entire repair.

## 3. How It Actually Works — The Full Explanation

JavaScript on the main thread runs **to completion** for each callback. While your function executes synchronously, the event loop cannot:

- Run other request handlers
- Fire timers
- Process completed I/O callbacks
- Deliver WebSocket messages
- Run `setImmediate` or drain microtasks from *other* turns (microtasks from the current callback still run when it yields internally via Promise, but the phase cannot advance)

Common blocking sources:

| Category | Examples |
|---|---|
| Sync I/O | `fs.readFileSync`, `fs.writeFileSync`, sync crypto |
| CPU-bound JS | Large loops, heavy JSON transforms, image decode on main thread |
| Sync crypto | `crypto.pbkdf2Sync`, sync `bcrypt` |
| Parsing | `JSON.parse` on huge strings |
| Regex DoS | Evil patterns on user input (`(a+)+$`) |
| Logic bugs | `while(true)`, accidental sync recursion |

**`async/await` does not unblock sync work.** This still blocks:

```js
async function handler() {
  const data = fs.readFileSync("/big/file"); // still synchronous
}
```

The `async` keyword only helps when you `await` operations that actually defer to libuv.

Even **short** blocks hurt at scale. A 50ms sync call under 100 concurrent requests does not cost 50ms total — it serializes through one thread and adds latency for **everyone** waiting on the loop.

Event loop lag (measured with `perf_hooks.monitorEventLoopDelay()`) is the production smoke alarm for blocking.

## 4. Real Code — See It Working

**Blocking vs non-blocking file read:**

```js
const fs = require("fs");

console.time("blocking");
const syncData = fs.readFileSync(__filename, "utf8");
console.timeEnd("blocking");
console.log("sync bytes:", syncData.length);

console.time("non-blocking");
fs.readFile(__filename, "utf8", (err, asyncData) => {
  console.timeEnd("non-blocking");
  console.log("async bytes:", asyncData.length);
});

console.log("this line runs before non-blocking read finishes");
```

**CPU block — nothing else runs:**

```js
const { performance } = require("perf_hooks");

function blockFor(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) {
    // busy wait — blocks the event loop
  }
}

setTimeout(() => console.log("timer fired"), 10);

console.log("starting block");
blockFor(100);
console.log("block done");

// "timer fired" waits until blockFor finishes — often ~100ms late
```

**Hidden blocking inside `async`:**

```js
const fs = require("fs/promises");

async function looksAsync() {
  // WHY: this line still blocks — await is never reached on sync work
  const bad = fs.readFileSync(__filename);
  return bad.length;
}

async function actuallyAsync() {
  const good = await fs.readFile(__filename, "utf8");
  return good.length;
}
```

**Detect lag with perf_hooks:**

```js
const { monitorEventLoopDelay } = require("perf_hooks");

const histogram = monitorEventLoopDelay({ resolution: 20 });
histogram.enable();

setTimeout(() => {
  console.log("p99 event loop delay (ms):", histogram.percentile(99) / 1e6);
  histogram.disable();
}, 500);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is blocking code in Node.js?**

Synchronous JavaScript on the main thread that prevents the event loop from processing other callbacks until it finishes — including sync I/O, CPU-heavy loops, large parses, and bad regex.

**Q: Why does one blocking handler affect all requests?**

One JavaScript thread runs the event loop. While it executes blocking code, no other callbacks run. Every connected client on that process waits.

**Q: Does `async/await` prevent blocking?**

Only when you await truly asynchronous operations. Sync calls inside an `async` function still block the thread.

**Q: What is ReDoS and how does it block Node?**

A regex with catastrophic backtracking tries exponentially many paths on crafted input. The regex engine runs synchronously on the main thread — event loop frozen until it finishes or you kill the process.

**Q: How do you detect blocking in production?**

Event loop delay/lag metrics (target often under 50–100ms p99 for interactive APIs), rising latency percentiles with flat I/O wait, and profilers like clinic.js. CPU may stay low while lag spikes — classic "async server blocked on JS" signature.

## 6. The Traps — What Goes Wrong

**Trap: "It's only 10ms of sync work."** Multiply by contention and queue depth — and remember everything serializes on one thread.

**Trap: Sync helpers in middleware.** Compression, auth token parsing, config reads — one sync read on every request adds up.

**Trap: `JSON.parse` on untrusted large payloads.** No size limit + parse = easy block or OOM.

**Trap: Assuming native addons are non-blocking.** Some bindings call sync C++ code on the main thread.

**Trap: Benchmarking with one request.** Blocking hides until concurrency exposes queue backup.

## 7. Compare With Related Concepts

| Term | Meaning |
|---|---|
| Blocking code | Sync work holding the main thread |
| Non-blocking I/O | Start I/O, callback later — thread moves on |
| Thread pool queue | Waiting fs/crypto work — not JS blocking until callback runs long |
| Worker threads | Move CPU off main thread |
| Backpressure | Slow consumer — different problem (flow control, not sync CPU) |

**Blocking vs non-blocking I/O:** Blocking waits on the thread; non-blocking delegates waiting to libuv/kernel and returns immediately.

**Rule:** If it runs synchronously on the main thread during a request, treat it as guilty until proven fast and bounded.

## 8. 🧠 The Memory Hook — What Sticks

Blocking code is a **breakdown on Node's one-lane bridge** — sync I/O, fat loops, or evil regex — and until it clears, **every** callback for **every** client on that process waits behind it.
