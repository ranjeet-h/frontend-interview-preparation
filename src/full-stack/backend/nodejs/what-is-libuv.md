# What is libuv

## 1. Why This Exists — The Problem First

JavaScript in the browser never had to talk to the file system, bind to port 3000, or spawn child processes. When Ryan Dahl built Node.js, V8 could run JS—but V8 alone had no opinion on sockets, timers, or threads.

Operating systems expose wildly different APIs: epoll on Linux, kqueue on macOS, IOCP on Windows. Writing async I/O that works everywhere is painful. Node needed a cross-platform layer that could say: "start this network read, tell me when data arrives, and give me a single event loop model that works on every OS."

That layer is **libuv**. Without it, Node.js would not be non-blocking. It would be a JavaScript shell that blocked on every syscall.

## 2. The Analogy — Make It Obvious

Picture a **stage manager** at a theater.

The actors on stage (your JavaScript on the main thread) perform the script. They cannot run backstage to fix lighting, adjust curtains, or wait for a sound cue—they would stop the show.

The stage manager (libuv) runs backstage:

- **Spotlight cues (timers)** — "In 5 seconds, dim lights."
- **Scene changes (I/O)** — "When the truck arrives at the dock, signal the actors."
- **Extra stagehands (thread pool)** — For jobs that cannot be done with the automated rigging, four crew members handle heavy lifting off-stage.

When backstage work finishes, the manager taps the conductor: "Cue scene 3." The actors resume. The audience (your users) sees a smooth show because the manager never lets actors wait in the dark behind a stuck curtain.

## 3. How It Actually Works — The Full Explanation

libuv is a C library originally built for Node.js. It provides:

- The **event loop** and its [phases](./what-are-event-loop-phases.md)
- **Async I/O** for files, sockets, pipes, and more
- A **thread pool** for work the OS cannot async natively
- Timers, signal handling, child processes, and cross-platform utilities

[V8](./what-is-v8.md) runs JavaScript. libuv runs everything else asynchronous around it. [How does Node.js work](./how-does-node-js-work.md) shows how bindings connect the two.

### Event loop phases (libuv's loop)

Each iteration visits phases in order:

1. **Timers** — `setTimeout`, `setInterval` callbacks whose delay elapsed
2. **Pending callbacks** — Some deferred system callbacks
3. **Idle / Prepare** — Internal libuv use
4. **Poll** — Retrieve new I/O events; execute I/O callbacks; may block here waiting for events
5. **Check** — `setImmediate` callbacks
6. **Close callbacks** — e.g. `socket.on('close')`

Between phases, Node (not strictly "inside" a phase) drains `process.nextTick` then Promise microtasks. See [What is process.nextTick](./what-is-process-nexttick.md).

The **poll phase** is where most network and completed file I/O callbacks run. If poll is always busy, later phases can starve—`setImmediate` may delay.

### Thread pool vs OS async I/O

| Mechanism | Typical operations | Default concurrency |
|-----------|-------------------|---------------------|
| OS async (epoll/kqueue/IOCP) | TCP/UDP sockets, most networking | Thousands of sockets |
| libuv thread pool | Many `fs` ops, some `crypto`, `zlib`, some DNS | **4 threads** default |

Network-heavy APIs rarely need a bigger pool. File- or crypto-heavy workloads may need `UV_THREADPOOL_SIZE=128` (example)—set before `node` starts.

### File descriptors and limits

Each socket and file handle consumes a descriptor. OS limits (`ulimit -n`) cap concurrent connections. Hitting the limit yields `EMFILE`—new connections fail suddenly. Monitor descriptor usage in high-connection services.

### Timers are "at least" delays

`setTimeout(fn, 100)` means "not before 100ms," not "exactly at 100ms." Event loop load and long poll phases push actual delay later.

## 4. Real Code — See It Working

**Event loop lag measurement (libuv health):**

```js
// monitor-lag.js
const { monitorEventLoopDelay } = require('perf_hooks');

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  console.log({
    meanMs: (h.mean / 1e6).toFixed(2),
    p99Ms: (h.percentile(99) / 1e6).toFixed(2),
    maxMs: (h.max / 1e6).toFixed(2),
  });
  h.reset();
}, 2000);

// Simulate blocking — watch p99 spike
setInterval(() => {
  const start = Date.now();
  while (Date.now() - start < 50) {
    // blocks libuv's ability to run JS callbacks promptly
  }
}, 5000);
```

**Thread pool saturation sketch:**

```js
// pool-saturation.js
const fs = require('fs');
const start = Date.now();

for (let i = 0; i < 6; i++) {
  fs.readFile(__filename, () => {
    console.log(`read ${i} finished at ${Date.now() - start}ms`);
  });
}
```

With default pool size 4, reads 4 and 5 often finish in a second batch.

**Active handles (what libuv is tracking):**

```js
// active-handles.js
const fs = require('fs');
const server = require('http').createServer();

const timer = setInterval(() => {}, 1000);
const file = fs.openSync(__filename, 'r');

console.log(process._getActiveHandles().length); // timers, servers, etc.

clearInterval(timer);
fs.closeSync(file);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is libuv?**

libuv is the C library that provides Node.js's event loop, async I/O, timers, thread pool, and cross-platform system abstractions. V8 executes JavaScript; libuv coordinates waiting on I/O and schedules callbacks when work completes.

**Q: What role does libuv play in Node.js?**

It is the async backbone. When you `fs.readFile` or accept a TCP connection, Node bindings call libuv. libuv interacts with the OS or thread pool, then queues a callback for the [event loop](./what-is-node-js-event-loop.md) when done.

**Q: What are the event loop phases?**

Timers → pending → idle/prepare → poll → check → close. Each phase processes its queue before advancing. Microtasks (`nextTick`, Promises) run between phases. Details in [What are event loop phases](./what-are-event-loop-phases.md).

**Q: What is the default thread pool size and which work uses it?**

Four threads. File system operations (most), some crypto, zlib, some DNS. Network sockets typically use OS async I/O, not the pool.

**Q: How do you increase the thread pool size?**

`UV_THREADPOOL_SIZE=16 node app.js` — must be set before the process starts. Does not help pure HTTP proxy workloads; helps heavy disk or crypto.

**Q: What is event loop lag and how do you measure it?**

Delay between event loop iterations—indicates the main thread was busy or blocked. `perf_hooks.monitorEventLoopDelay()` in Node. High lag means slow responses for everything, not one route.

**Q: What happens when file descriptor limits are hit?**

New sockets and files fail with `EMFILE`. Existing connections may work; new ones drop. Fix: raise limits carefully, fix connection leaks, use connection pooling.

**Q: Why does libuv matter in production?**

It determines how concurrent I/O behaves under load—poll phase duration, pool saturation, timer drift, and whether `setImmediate` callbacks get starved. Backend latency often traces to libuv behavior, not SQL alone.

## 6. The Traps — What Goes Wrong

**Trap: "libuv = Node.js."**

libuv is a library. Luvit and other runtimes use it too. Node adds V8, bindings, and the JS standard library.

**Trap: Increasing `UV_THREADPOOL_SIZE` for API latency when the API is network-bound.**

Pool size does not speed up HTTP to PostgreSQL. Profile first.

**Trap: Assuming all async APIs are equally non-blocking.**

`fs.readFile` is async but uses the pool—under load it queues. `fs.readFileSync` blocks the main thread entirely. Both can hurt; differently.

**Trap: `setTimeout(fn, 0)` means "run immediately."**

It schedules for the **timers phase** of a future loop turn—after microtasks and possibly after I/O.

**Trap: Continuous I/O starving `setImmediate`.**

If poll never empties, check phase waits. Deferred cleanup via `setImmediate` may run late.

**Trap: Ignoring `ulimit -n` until production meltdown.**

WebSocket farms and connection pools need thousands of fds. Plan limits in deployment.

## 7. Compare With Related Concepts

| Concept | vs libuv |
|---------|----------|
| [V8](./what-is-v8.md) | Runs JS; libuv schedules I/O around it |
| [Node.js event loop](./what-is-node-js-event-loop.md) | Conceptual model; libuv implements phases |
| [process.nextTick](./what-is-process-nexttick.md) | Node API outside libuv phases, highest priority |
| [setImmediate](./what-is-setimmediate.md) | Runs in libuv's check phase |
| Browser event loop | No libuv, no thread pool, includes rendering |

**libuv vs OS threads per request:** libuv multiplexes many connections on one JS thread plus small pool; threaded servers use more RAM per concurrent request but isolate CPU work naturally.

**Rule:** Network tuning → connections and OS async; disk/crypto slowness → thread pool and blocking sync calls.

## 8. 🧠 The Memory Hook — What Sticks

libuv is the **backstage stage manager** for Node: it never lets JavaScript wait in the dark—it runs timers, watches sockets, sends heavy lifting to four default stagehands, and taps the conductor when a cue is ready. If the main show (V8) stops, the whole theater stops—but most "slowness" is backstage capacity, not the actors forgetting their lines.
