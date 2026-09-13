# How does Node.js work

## 1. Why This Exists — The Problem First

Your API is slow under load. You add more servers, but latency still spikes. You profile the code and find nothing "wrong"—no N+1 queries, no missing indexes. Then you discover one route calls `fs.readFileSync` on every request, or a middleware runs `JSON.parse` on a 10MB body synchronously.

The code looks fine. It returns the right data. But it freezes the entire process for hundreds of milliseconds because you did not understand **how Node.js actually runs your code**—one JavaScript thread, an event loop, and async I/O delegated to libuv.

Without that mental model, you cannot debug timing bugs, predict callback order, or choose between `setImmediate`, `process.nextTick`, and `await`.

## 2. The Analogy — Make It Obvious

Think of a **restaurant with one head chef** (V8 running JavaScript) and a **kitchen operations manager** (libuv).

The head chef reads recipes and executes steps on the line. They never wait at the oven door. When a dish needs baking (file read, database query, HTTP call), the manager sends it to the right station—network I/O goes to the OS's fast lane; file work goes to a small prep crew (thread pool). The chef immediately starts another recipe.

When baking finishes, the manager puts a ticket on the chef's board: "Dish 7 is ready—finish plating." The chef picks up that ticket when their hands are free (call stack empty). That ticket system is the **event loop**.

Node.js bindings are the **translator** between the chef's language (JavaScript) and the manager's systems (C APIs, sockets, file handles).

## 3. How It Actually Works — The Full Explanation

Node.js stacks four layers:

### Layer 1: V8

[V8](./what-is-v8.md) compiles and executes JavaScript on a **single main thread**. It maintains the call stack. When your function returns or hits `await`, V8 may exit that frame and later re-enter when a callback runs.

### Layer 2: Node.js bindings (C++)

Native code bridges JavaScript to the operating system: creating sockets, wrapping `fs` calls, exposing `process`. When you call `fs.readFile()`, JavaScript invokes C++ that hands work to libuv.

### Layer 3: libuv

[libuv](./what-is-libuv.md) owns the [event loop](./what-is-node-js-event-loop.md), timers, and async I/O:

- **Network I/O** (TCP, HTTP): uses OS async APIs (epoll/kqueue/IOCP). Does not use the thread pool.
- **File system, some DNS, crypto, zlib**: often uses a **thread pool** (default **4 threads**). Work runs on a pool thread; completion callbacks queue for the event loop.
- **Timers**: `setTimeout` / `setInterval` tracked in the timers phase.

Tune pool size with `UV_THREADPOOL_SIZE` before process start—only helps pool-backed work, not network.

### Layer 4: Your JavaScript

Frameworks (Express, Fastify) sit on `http`. Your handlers run on the main thread. `async/await` is syntactic sugar over Promises; when you `await` I/O, the function suspends and resumes via microtasks and phase callbacks.

### One request lifecycle

1. HTTP server receives a connection (poll phase I/O).
2. libuv notifies Node; a callback runs on the main thread.
3. Your handler runs: `const users = await db.query(...)`.
4. Database client submits query; libuv/OS waits on the network socket.
5. Main thread is free—other requests, timers, and I/O run.
6. Query completes; callback/microtask resumes your handler.
7. `res.json(users)` sends the response.

### What blocks the system

Anything that keeps V8 busy on the main thread without yielding: sync file I/O, infinite loops, huge synchronous JSON parse, `while` spinning. That stops the entire [event loop](./what-is-node-js-event-loop.md)—not just one request.

### Phases and microtasks

Between [event loop phases](./what-are-event-loop-phases.md), Node runs `process.nextTick` callbacks then Promise microtasks. See [What is process.nextTick](./what-is-process-nexttick.md). Phase order determines when `setTimeout` vs `setImmediate` fire.

## 4. Real Code — See It Working

**Architecture demo — who runs when:**

```js
// architecture-demo.js
const fs = require('fs');

console.log('1 sync start');

setTimeout(() => console.log('4 setTimeout (timers phase)'), 0);

setImmediate(() => console.log('5 setImmediate (check phase)'));

Promise.resolve().then(() => console.log('3 Promise microtask'));

process.nextTick(() => console.log('2 process.nextTick'));

fs.readFile(__filename, () => {
  console.log('6 I/O callback (poll phase)');
  setTimeout(() => console.log('7 setTimeout inside I/O'), 0);
  setImmediate(() => console.log('8 setImmediate inside I/O'));
});

console.log('1 sync end');
```

Typical output:

```
1 sync start
1 sync end
2 process.nextTick
3 Promise microtask
4 setTimeout (timers phase)
5 setImmediate (check phase)
6 I/O callback (poll phase)
8 setImmediate inside I/O
7 setTimeout inside I/O
```

Inside the I/O callback, `setImmediate` runs before `setTimeout`—you are past the timers phase in that turn.

**Thread pool vs network (conceptual timing):**

```js
// pool-vs-net.js — run with: node pool-vs-net.js
const fs = require('fs');
const http = require('http');

const start = Date.now();
const log = (label) => console.log(`${label}: ${Date.now() - start}ms`);

// Four concurrent file reads — default pool has 4 threads; fifth waits
for (let i = 0; i < 5; i++) {
  fs.readFile(__filename, () => log(`file read ${i}`));
}

// Network I/O does not compete with the file thread pool the same way
http.get('http://localhost:1', () => {}).on('error', () => log('network attempt done'));
```

With five file reads, the fifth often completes noticeably later—pool saturation.

## 5. The Interview Questions — All of Them, Done Properly

**Q: How does Node.js work under the hood?**

Three core pieces: V8 executes JavaScript on one main thread; libuv provides the event loop, timers, and async I/O (OS async for network, thread pool for many file/crypto operations); Node.js bindings connect JavaScript APIs to libuv and the OS. Async calls delegate slow work, register callbacks, and return immediately. When work completes, callbacks enter the event loop and run when the call stack is empty.

**Q: What are the layers of Node.js architecture?**

V8 (JS engine), libuv (event loop + I/O), Node bindings (C++ bridge), and your JavaScript plus npm modules. [What is Node.js](./what-is-node-js.md) is the runtime product; these layers are the implementation.

**Q: How does non-blocking I/O work in Node.js?**

When you start I/O, Node submits it to libuv or the OS and returns control to JavaScript. The main thread does not sit in a blocking `read()` syscall for that socket. libuv signals completion; a callback runs on the main thread. Thousands of in-flight I/O operations can exist while one thread runs JavaScript.

**Q: What is the default thread pool size and how do you change it?**

Default is 4 threads. Set `UV_THREADPOOL_SIZE=16` (example) **before** starting Node. Only affects pool-backed work—not HTTP client/server traffic.

**Q: Which operations use the thread pool vs OS async I/O?**

Pool: most `fs` operations, some DNS lookups, `crypto` (some algorithms), `zlib`. OS async: TCP/UDP sockets, most networking. Misunderstanding this leads to wrong tuning—you bump the pool but network was never the bottleneck.

**Q: What causes event loop lag?**

Synchronous work on the main thread: `readFileSync`, heavy CPU, large sync `JSON.parse`, regex on huge strings, `bcrypt.hashSync`. Measure with `perf_hooks.monitorEventLoopDelay()`. Lag above ~100ms usually means something is blocking.

**Q: How does `async/await` fit into this model?**

`await` suspends an async function and returns a Promise. When the awaited operation completes, continuation runs as a microtask (Promise `.then`). It does not block the thread—it schedules resumption. The event loop still processes other work while waiting.

## 6. The Traps — What Goes Wrong

**Trap: "Node.js is entirely single-threaded."**

JavaScript on one thread; libuv pool threads exist. Network I/O is async at the OS level. File I/O often uses the pool. Your code is still single-threaded unless you use workers.

**Trap: Saturating the thread pool and blaming the database.**

Five concurrent `fs.readFile` on a 4-thread pool queues the fifth. If your API reads config files per request, you self-inflict latency that looks like "slow disk."

**Trap: Assuming `await` parallelizes work.**

`await a(); await b();` is sequential. Use `await Promise.all([a(), b()])` when independent.

**Trap: Ignoring phase ordering in debugging.**

A bug "only happens sometimes" may be `setTimeout` vs `setImmediate` ordering or microtasks running before timers. See [Event loop phases](./what-are-event-loop-phases.md).

**Trap: Using sync APIs "because it's simpler."**

Simplicity in code becomes complexity in production—spiky p99 latency and mysterious freezes under load.

## 7. Compare With Related Concepts

| Topic | Relationship |
|-------|----------------|
| [What is Node.js](./what-is-node-js.md) | Product and use cases |
| [What is V8](./what-is-v8.md) | Executes JS; JIT, GC, main thread |
| [What is libuv](./what-is-libuv.md) | Event loop and I/O implementation |
| [What is the Node.js event loop](./what-is-node-js-event-loop.md) | Callback scheduling model |
| [What is non-blocking I/O](./what-is-non-blocking-i-o.md) | The pattern Node relies on |
| [What is blocking code](./what-is-blocking-code.md) | What breaks the model |

**How Node.js works vs browser JS:** Same V8 family, but Node adds libuv phases, `process.nextTick`, thread pool, and no render step. See [Browser vs Node event loop](./browser-event-loop-vs-node-js-event-loop.md).

**Rule:** When debugging "how does this run," trace: sync code → nextTick → Promises → event loop phases → I/O completion.

## 8. 🧠 The Memory Hook — What Sticks

Node.js is **one chef** (V8 on one thread) with a **kitchen manager** (libuv) who never lets the chef stare at the oven—slow jobs go to the OS or a small prep crew, and the chef only cooks when a **ticket** (callback) says something is ready. If the chef chops vegetables for three minutes straight without checking tickets, every table in the restaurant waits.
