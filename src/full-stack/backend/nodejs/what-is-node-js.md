# What is Node.js

## 1. Why This Exists — The Problem First

You built a web app. The frontend is JavaScript. The backend is Python or Java. Every time you change a validation rule, you update two languages. Every time you hire, you need two skill sets. Every time you share a type definition, you copy-paste it and hope it stays in sync.

Meanwhile, your API server sits idle while waiting for a database query to finish. One thread handles one request at a time. To serve 1,000 concurrent users, you spin up 1,000 threads. Memory explodes. Context switching eats CPU.

Node.js was built to solve both problems: run JavaScript on the server, and handle many concurrent connections without spawning a thread per request. If you treat it like "JavaScript in the browser," you will misunderstand what it is and misuse it in production.

## 2. The Analogy — Make It Obvious

Picture a busy restaurant with **one waiter** and a large kitchen staff.

The waiter (your JavaScript code) does not stand at the stove waiting for each dish. They take an order, hand it to the kitchen, and immediately walk to the next table. When a dish is ready, the kitchen rings a bell. The waiter picks up that plate and serves it.

The waiter never does heavy cooking—that would freeze the whole dining room. They coordinate. The kitchen (libuv and the OS) does the slow work: boiling pasta, grilling steak, reading files from disk, talking to databases over the network.

Node.js is that waiter. One thread of JavaScript coordinates I/O. Slow work happens elsewhere. When I/O finishes, callbacks run. Thousands of "tables" (connections) can be served without thousands of waiters (threads).

## 3. How It Actually Works — The Full Explanation

Node.js is **not** a programming language. It is a **runtime**—an environment that runs JavaScript outside the browser.

Three pieces stack together:

1. **V8** — Google's JavaScript engine (same family as Chrome). It parses your code, compiles hot paths to machine code, and runs it on a single main thread. See [What is V8](./what-is-v8.md).

2. **libuv** — A C library that provides the event loop, timers, and async I/O. It uses OS mechanisms (epoll on Linux, kqueue on macOS) for network I/O and a small thread pool for work that cannot be async at the OS level (file system, some crypto). See [What is libuv](./what-is-libuv.md).

3. **Node.js bindings and APIs** — C++ glue plus JavaScript modules (`fs`, `http`, `crypto`, `path`, etc.) that expose server capabilities: file system, networking, processes, streams.

When you write `await db.query('SELECT ...')`, your handler function pauses at `await`. V8 does not block the thread—it schedules the rest of the function as a callback. libuv waits for the database response. While waiting, the [event loop](./what-is-node-js-event-loop.md) runs other requests, timers, and I/O callbacks.

**What Node.js is good at:** I/O-bound work—APIs, proxies, WebSockets, SSR, queue workers that mostly wait on network or disk.

**What it is bad at:** CPU-bound work on the main thread—image processing, video encoding, crunching huge JSON, bcrypt on every request without offloading. One long computation blocks every concurrent request because JavaScript runs on one thread.

**What Node.js is not:** It is not multi-threaded for your application logic by default. Worker threads and the cluster module exist, but the default model is single-threaded JavaScript plus async I/O. See [What are worker threads](./what-are-worker-threads.md) and [Cluster vs worker threads](./cluster-vs-worker-threads.md).

**Browser vs server:** No DOM, no `window`, no `document`. Instead: `process`, `Buffer`, native `http`/`fs` modules, and direct access to the machine's resources—with very different security implications.

## 4. Real Code — See It Working

Save as `node-demo.js` and run with `node node-demo.js`.

```js
// Minimal HTTP server — one process, many concurrent connections
const http = require('http');

let requestCount = 0;

const server = http.createServer((req, res) => {
  requestCount += 1;
  const id = requestCount;

  // Simulate slow I/O (database) without blocking other requests
  setTimeout(() => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Request #${id} handled\n`);
  }, 100);
});

server.listen(3000, () => {
  console.log('Listening on http://localhost:3000');
  console.log('Run: curl http://localhost:3000 & curl http://localhost:3000 & curl http://localhost:3000');
});
```

Three simultaneous `curl` requests all get responses in ~100ms total, not 300ms—because the server does not block while "waiting."

**Blocking vs non-blocking on the same thread:**

```js
const http = require('http');

// BAD: blocks the entire server for 3 seconds per request
function blockingHandler(req, res) {
  const start = Date.now();
  while (Date.now() - start < 3000) {
    // CPU spin — event loop cannot run anything else
  }
  res.end('done');
}

// GOOD: yields to the event loop
function nonBlockingHandler(req, res) {
  setTimeout(() => res.end('done'), 3000);
}

const server = http.createServer(nonBlockingHandler);
server.listen(3001);
```

Hit the blocking server with two concurrent requests and the second waits 6 seconds. Hit the non-blocking one and both finish in ~3 seconds.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is Node.js?**

Node.js is a JavaScript runtime built on V8 and libuv that runs JavaScript on servers and devices outside the browser. It provides an event-driven, non-blocking I/O model: when your code starts a slow operation (network, disk, database), it registers a callback and keeps processing other work. When the operation completes, the callback runs on the main thread. That design lets one process handle thousands of concurrent connections with relatively low memory compared to thread-per-request servers.

**Q: What makes Node.js different from browser JavaScript?**

Same language (JavaScript), different runtime APIs and goals. The browser has the DOM, rendering, and user events. Node.js has `fs`, `http`, `process`, `Buffer`, and no UI. The browser event loop includes rendering; Node.js uses libuv's phased loop with `process.nextTick` and `setImmediate`. See [Browser event loop vs Node.js event loop](./browser-event-loop-vs-node-js-event-loop.md). Security context differs: server code touches databases and secrets; browser code runs in a sandbox.

**Q: Why is Node.js good for I/O-bound work but bad for CPU-bound work?**

JavaScript executes on a single main thread. I/O-bound work delegates waiting to libuv or the OS—the thread stays free. CPU-bound work (loops, parsing megabytes of JSON, synchronous crypto) occupies that thread until finished. Every other request, timer, and WebSocket message waits. For CPU work, use worker threads, child processes, or a separate service.

**Q: Is Node.js multi-threaded?**

Your JavaScript runs on one thread by default. libuv uses a small thread pool (default 4 threads) for certain async operations like file reads and some crypto. Network I/O typically uses OS async APIs, not that pool. So: multi-threaded under the hood for some I/O, single-threaded for your application logic unless you explicitly use workers or clustering.

**Q: Why does Node.js matter for full-stack development?**

One language across frontend and backend enables shared validation (Zod), types (TypeScript), and utilities. Node.js also powers the tooling ecosystem—Vite, webpack, Next.js build pipeline. For API servers and real-time features, the non-blocking model is efficient when workloads are I/O-heavy. It is not a universal backend choice; it is a strong fit for many API and BFF layers.

**Q: What would you monitor in production for a Node.js service?**

Event loop lag first—if the loop stalls, every request stalls. Target under ~100ms for healthy services. Also heap and RSS memory (leaks), request latency (p50/p95/p99), error rates, active connections, and GC pauses. `perf_hooks.monitorEventLoopDelay()` measures lag. Unhandled promise rejections crash the process by default in modern Node—monitor and handle them.

**Q: How do unhandled promise rejections affect Node.js?**

In Node.js 15+, an unhandled rejection terminates the process by default. That is intentional: silent failures in async code are worse than a crash with logs. Use `process.on('unhandledRejection', ...)` for logging, but fix the root cause—every `async` route handler needs error middleware or try/catch.

## 6. The Traps — What Goes Wrong

**Trap: "Node.js is multi-threaded, so CPU work is fine."**

Wrong. Only libuv's pool and optional workers are multi-threaded. Heavy CPU on the main thread blocks everything. A single `JSON.parse` on a 50MB string during a request can spike latency for all users.

**Trap: Using synchronous APIs in request handlers.**

`fs.readFileSync`, `bcrypt.hashSync`, `child_process.execSync` block the event loop. They are fine at startup or in CLI scripts, not in hot request paths. See [What is blocking code](./what-is-blocking-code.md).

**Trap: Assuming Node.js replaces all backend languages.**

Node.js excels at I/O-heavy APIs and real-time systems. It is a poor default for heavy computation, hard real-time guarantees, or teams whose strength is JVM/Go ecosystems. Choose based on workload, not hype.

**Trap: Treating `async` as magic concurrency.**

`async/await` does not create threads. It yields control while waiting on I/O. Two `await` database calls in sequence still wait twice; parallelize with `Promise.all` when independent.

**Trap: Ignoring memory and connection limits.**

One process can handle many connections, but each connection consumes memory and file descriptors. `ulimit -n` caps open files; hitting it causes `EMFILE` and sudden connection failures.

## 7. Compare With Related Concepts

| Concept | Key difference | When to use which |
|--------|----------------|-------------------|
| **Browser JavaScript** | DOM, rendering, no direct file/network server APIs | Client UI and interaction |
| **Node.js** | Server APIs, libuv event loop, no DOM | APIs, SSR, tooling, real-time backends |
| **Deno** | Secure by default, TypeScript-native, different APIs | New projects wanting modern defaults |
| **Traditional threaded server (e.g. Spring, Tomcat)** | Thread per request model | CPU-heavy or mature JVM ecosystems |
| **Go / Rust services** | Native concurrency, compiled performance | CPU-bound or maximum throughput per core |

**Node.js vs [How does Node.js work](./how-does-node-js-work.md):** "What is Node.js" is the product and use case. "How does it work" is the internal architecture—V8, libuv, bindings, and request lifecycle.

**Node.js vs [What is non-blocking I/O](./what-is-non-blocking-i-o.md):** Node.js is the runtime; non-blocking I/O is the core design pattern that makes the runtime efficient for concurrent connections.

## 8. 🧠 The Memory Hook — What Sticks

Node.js is a **single waiter** (one JavaScript thread) serving **many tables** (connections) by never standing at the stove—slow work goes to the kitchen (libuv/OS), and the waiter only runs when a plate is ready (callback). Great when meals are mostly waiting on the kitchen; terrible when the waiter tries to cook everything themselves.
