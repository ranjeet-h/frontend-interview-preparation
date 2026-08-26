# What is EventEmitter

## 1. Why This Exists — The Problem First

Your HTTP server needs to notify three subsystems when a user signs up: send email, update analytics, and warm a cache. The naive design calls all three directly inside the signup handler. Adding a fourth subscriber means editing the handler again. Testing signup requires mocking email, analytics, and cache in one test. One slow subscriber blocks the others.

Node.js is built around **events** instead of deep call chains. Something happens → emit a named signal → whoever registered interest reacts. The emitter does not know or care who is listening. That decoupling is `EventEmitter` — the observer pattern wired into Node's core.

Streams, HTTP servers, process signals, and most core modules inherit from it.

## 2. The Analogy — Make It Obvious

Think of a **radio station broadcasting on named channels**.

- The station (`EventEmitter`) broadcasts on frequency names (`'user:signup'`, `'error'`, `'data'`).
- Listeners tune in with `on('user:signup', handler)` — they choose which broadcasts to care about.
- `emit('user:signup', user)` sends the broadcast with payload — every tuned-in listener hears it **right now**, synchronously, in registration order.
- `once('connect', handler)` auto-unsubscribes after the first broadcast.
- The **`error` channel is special** — if `'error'` is emitted and nobody is listening, Node throws and crashes the process.

The station does not call listeners by name. It announces; listeners react. Add a new listener without changing the broadcaster.

## 3. How It Actually Works — The Full Explanation

**Core API.**

| Method | Purpose |
|---|---|
| `on(event, listener)` / `addListener` | Register a callback |
| `once(event, listener)` | Register for one firing, then remove |
| `emit(event, ...args)` | Invoke all listeners synchronously |
| `off(event, listener)` / `removeListener` | Unsubscribe |
| `removeAllListeners(event?)` | Clear listeners |
| `listenerCount(event)` | How many listeners |
| `setMaxListeners(n)` | Raise default warning threshold (10) |

**Synchronous execution.** `emit()` runs every listener on the call stack before returning. A slow listener blocks later listeners and the code that called `emit()`. Defer heavy work with `setImmediate()` or queue to a worker.

**The special `error` event.** Unhandled `'error'` emits throw as an uncaught exception. Always attach `emitter.on('error', handler)` on any emitter that can fail — especially streams and sockets.

**Inheritance pattern.** Most Node classes extend `EventEmitter`:

```js
const { EventEmitter } = require("events");

class OrderService extends EventEmitter {
  placeOrder(order) {
    // ... save order ...
    this.emit("order:placed", order);
  }
}
```

**Max listeners warning.** Default 10 listeners per event triggers `MaxListenersExceededWarning` — usually a memory leak (listeners added in a loop without removal). Legitimate cases (many HTTP connections on a server) can call `setMaxListeners(0)` to disable the warning.

**Async listeners are fire-and-forget.** `emitter.on('data', async () => { ... })` does not await the async function. Errors inside become unhandled promise rejections unless you try/catch inside the listener.

**Built on everywhere.** `req.on('data')`, `stream.on('end')`, `process.on('SIGTERM')`, `server.on('request')` — all EventEmitter.

## 4. Real Code — See It Working

**Basic pub/sub**

```js
const { EventEmitter } = require("events");

const bus = new EventEmitter();

bus.on("user:signup", (user) => {
  console.log("send welcome email to", user.email);
});

bus.on("user:signup", (user) => {
  console.log("track signup for", user.id);
});

// WHY: emit calls all listeners synchronously before moving on
bus.emit("user:signup", { id: 1, email: "a@b.com" });
```

**Mandatory error handling**

```js
const { EventEmitter } = require("events");
const emitter = new EventEmitter();

emitter.on("error", (err) => {
  // WHY: without this, emit('error', err) crashes the process
  console.error("handled:", err.message);
});

emitter.emit("error", new Error("disk full"));
```

**`once` for one-time setup**

```js
const db = new EventEmitter();

db.once("connected", () => {
  console.log("run migrations once");
  startServer();
});

db.emit("connected");
db.emit("connected"); // second emit — listener already removed
```

**Safe async listener**

```js
emitter.on("job", (payload) => {
  // WHY: wrap async work — emit does not await you
  (async () => {
    try {
      await processJob(payload);
    } catch (err) {
      emitter.emit("error", err);
    }
  })();
});
```

**Extending EventEmitter in a service**

```js
const { EventEmitter } = require("events");

class UploadTracker extends EventEmitter {
  constructor() {
    super();
    this.bytes = 0;
  }

  addChunk(size) {
    this.bytes += size;
    this.emit("progress", { bytes: this.bytes });
    if (this.bytes >= this.limit) this.emit("complete");
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is EventEmitter in Node.js?**

A class implementing the observer pattern — objects emit named events and registered listeners run in response. Core to Node's architecture: streams, HTTP, and process events all inherit from it. Methods include `on`, `once`, `emit`, and `removeListener`. Listeners run synchronously when `emit` is called.

**Q: Why is the `error` event special?**

If `'error'` is emitted and no listener is registered, Node treats it as an uncaught exception and crashes the process. Streams emit `'error'` on I/O failure. Always attach an `error` handler on any emitter that can fail.

**Q: Are event listeners sync or async?**

Synchronous. `emit()` invokes each listener immediately on the same call stack, in registration order. A slow listener blocks everything after it. Offload heavy work with `setImmediate`, a queue, or worker threads.

**Q: What is the max listeners warning?**

Node warns when more than 10 listeners attach to one event — a common sign of a leak (e.g. `on()` inside a request handler without `off()`). Increase with `setMaxListeners()` when many listeners are intentional.

**Q: How is EventEmitter related to streams?**

`stream.Stream` inherits from `EventEmitter`. Stream events (`data`, `end`, `drain`, `error`) are EventEmitter events plus flow-control logic (buffering, backpressure). EventEmitter alone has no backpressure.

**Q: EventEmitter vs message queue (Redis, RabbitMQ)?**

EventEmitter is in-process, synchronous dispatch to listeners in the same Node process. Message queues are cross-process or cross-machine, async, persisted, and survive restarts. Use EventEmitter for internal decoupling; use queues for distributed systems.

## 6. The Traps — What Goes Wrong

**No `error` handler.** Process crash on first stream or socket error.

**Listener leak — `on()` without `off()`.** Registering inside `server.on('request')` without cleanup adds listeners every request. Memory grows; eventually MaxListenersExceededWarning or OOM.

**Async listener without try/catch.** Rejected promises inside async listeners become unhandled rejections — silent failures or crash depending on Node version and flags.

**Slow sync listener blocks others.** One 2-second listener in a chain of five delays all five plus the emitter.

**Using EventEmitter for cross-service communication.** Events die when the process dies. No retry, no persistence, no other machines listening.

**Assuming emit order across different events.** Only listeners on the **same** event run in registration order. `'A'` then `'B'` emits do not guarantee cross-event ordering with async side effects.

## 7. Compare With Related Concepts

**EventEmitter vs callbacks**

Callbacks wire one caller to one function. EventEmitter wires one emitter to **many** listeners on the same event name — many-to-one subscription.

**EventEmitter vs Promises**

Promises chain one async flow with a single resolution path. EventEmitter handles **multiple** reactions to **multiple** occurrences over time (`'data'` fires many times). They solve different shapes; Node 15+ `EventEmitter` can expose `events.on(emitter, 'event')` async iterators.

**EventEmitter vs streams**

Streams **are** EventEmitters plus buffering, backpressure, and standard read/write APIs. Raw EventEmitter has no flow control — emit faster than listeners process and you have no automatic pause.

**When to use which**

- Internal module decoupling in one process → EventEmitter.
- Byte flow with memory bounds → streams.
- Cross-service async work → message queue.
- One async result → Promise/async-await.

## 8. 🧠 The Memory Hook — What Sticks

EventEmitter is a **radio station**: `emit` broadcasts, `on` tunes in, listeners run **right now** in sign-up order. The `'error'` channel is special — silence on that frequency crashes the show. Never `on()` in a loop without `off()`, and never do heavy work synchronously inside a listener.
