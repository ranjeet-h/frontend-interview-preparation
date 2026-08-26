# What are worker threads

## 1. Why This Exists — The Problem First

Your Node.js API handles 500 concurrent requests fine — until someone uploads a PDF and you run `pdf-parse` synchronously on the main thread. Every other request freezes for eight seconds. Health checks fail, the load balancer marks the instance unhealthy, and users see timeouts on completely unrelated endpoints.

Node.js runs your JavaScript on a single thread. Async I/O (database calls, HTTP requests) does not block that thread — the event loop delegates I/O to the kernel and moves on. But CPU-heavy work — image resizing, PDF parsing, bcrypt rounds, JSON serialization of huge payloads — runs synchronously on the main thread and blocks everything behind it. Worker threads exist to move that CPU work off the main thread without abandoning JavaScript.

## 2. The Analogy — Make It Obvious

Picture a restaurant with one head waiter who takes orders, delivers food, and handles payments.

Most of the time the waiter is efficient — they take an order, send it to the kitchen (async I/O), and immediately help the next table. But one customer asks the waiter to personally grind coffee beans by hand at the table. The waiter stands there grinding for ten minutes. Every other table waits.

Worker threads are like hiring extra staff in a back prep room. The head waiter still takes orders and serves food (main thread, event loop). When someone needs coffee ground, the waiter hands the beans to a prep worker, keeps serving other tables, and picks up the ground coffee when it's ready. The prep workers share the same building (same process) but work in parallel on their own tasks.

## 3. How It Actually Works — The Full Explanation

Worker threads (`worker_threads` module, stable since Node.js 12) let you run JavaScript in parallel OS threads within the same Node.js process.

Each worker gets:

- Its own V8 isolate (separate JavaScript heap)
- Its own event loop and libuv thread pool
- Its own `MessagePort` for communication with the parent

The parent thread (your main server) spawns workers with `new Worker('./worker.js')`. Communication happens two ways:

**Message passing** — `parentPort.postMessage(data)` and `worker.on('message', callback)`. Data is serialized via the structured clone algorithm (like `postMessage` in browsers). Fast for small payloads; expensive for large objects.

**Shared memory** — `SharedArrayBuffer` lets multiple threads read/write the same memory. `Atomics` provides safe concurrent access (locks, compare-and-swap). Use this when you're moving megabytes of data and serialization would dominate.

Key properties:

| Property | Worker threads | Main thread |
|---|---|---|
| CPU-bound sync code | Runs in parallel | Blocks event loop |
| I/O-bound async code | Has its own event loop | Already non-blocking |
| Memory | Separate V8 heap per worker | Shared process memory for SAB |
| Crash isolation | Worker crash can kill process | N/A |

Worker threads are **not** child processes. They share the same process ID, file descriptors, and can share memory. They are lighter than `cluster` forks but provide less isolation.

When to use them:

- Image/video processing, PDF generation, compression
- Heavy JSON parsing or transformation
- Cryptography (bcrypt, argon2 with high cost factor)
- CPU-bound algorithms (simulations, ML inference in JS)

When **not** to use them:

- Database queries, HTTP calls, file reads — async I/O already handles concurrency
- One-off tiny computations — worker startup cost (~tens of ms) exceeds the work
- Replacing cluster for request distribution — that's a different problem

Production pattern: a **worker pool** — create N workers at startup (usually `os.cpus().length - 1`), push tasks to a queue, reuse workers instead of spawning per request.

## 4. Real Code — See It Working

**Basic worker — offload bcrypt hashing**

Main thread (`server.js`):

```javascript
const { Worker } = require('worker_threads');
const path = require('path');

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'hash-worker.js'), {
      workerData: { password, rounds: 12 },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker stopped with code ${code}`));
    });
  });
}

// Express route stays responsive while hashing runs off-thread
app.post('/register', async (req, res) => {
  const hash = await hashPassword(req.body.password);
  await db.users.create({ email: req.body.email, passwordHash: hash });
  res.status(201).json({ ok: true });
});
```

Worker (`hash-worker.js`):

```javascript
const { parentPort, workerData } = require('worker_threads');
const bcrypt = require('bcrypt');

// CPU-heavy work runs here — main event loop is free
const hash = bcrypt.hashSync(workerData.password, workerData.rounds);
parentPort.postMessage(hash);
```

**Worker pool — reuse workers for repeated tasks**

```javascript
const { Worker } = require('worker_threads');
const os = require('os');

class WorkerPool {
  constructor(workerPath, size = os.cpus().length - 1) {
    this.queue = [];
    this.workers = Array.from({ length: size }, () => this._createWorker(workerPath));
    this.freeWorkers = [...this.workers];
  }

  _createWorker(workerPath) {
    const worker = new Worker(workerPath);
    worker.on('message', (result) => {
      const { resolve } = worker.currentTask;
      worker.currentTask = null;
      this.freeWorkers.push(worker);
      resolve(result);
      this._runNext();
    });
    worker.on('error', (err) => {
      if (worker.currentTask) worker.currentTask.reject(err);
    });
    return worker;
  }

  run(data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this._runNext();
    });
  }

  _runNext() {
    if (!this.queue.length || !this.freeWorkers.length) return;
    const worker = this.freeWorkers.pop();
    const task = this.queue.shift();
    worker.currentTask = task;
    worker.postMessage(task.data);
  }
}

// Pool created once at startup — not per request
const imagePool = new WorkerPool('./resize-worker.js', 4);
app.post('/upload', async (req, res) => {
  const thumbnail = await imagePool.run(req.file.buffer);
  res.json({ thumbnail });
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What are worker threads in Node.js?**

Parallel JavaScript execution within the same process. Each worker has its own V8 isolate and event loop. The parent communicates via `postMessage` or `SharedArrayBuffer`. They let you run CPU-bound code without blocking the main event loop.

**Q: When should you use worker threads vs async I/O?**

Async I/O for waiting on external systems — databases, HTTP, filesystem. Worker threads for CPU-bound synchronous JavaScript — hashing, image processing, parsing large files. If your code is waiting, use async. If your code is computing, use workers.

**Q: Why use a worker pool instead of creating a worker per task?**

Spawning a worker costs time and memory (new V8 isolate). For a task that takes 50ms, a 30ms spawn overhead makes workers pointless. A pool keeps workers warm and feeds them from a queue — amortizing startup cost across many tasks.

**Q: How do worker threads differ from cluster?**

Cluster forks separate processes — each has its own memory, good for distributing HTTP requests across cores with fault isolation. Worker threads share a process — good for parallelizing CPU work within a single request. They complement each other: cluster for request-level parallelism, worker threads for task-level parallelism inside a worker.

**Q: What happens if a worker throws an error?**

The worker emits an `error` event on the parent. It does not automatically crash the parent, but an unhandled error in the worker can terminate that worker thread. Attach `worker.on('error', ...)` and replace crashed workers in a pool.

**Q: What would you monitor in production?**

Worker pool queue depth (backlog growing = need more workers), task latency (p50/p95), worker crash rate, and main-thread event loop lag. If queue depth grows while CPU is saturated, you've hit the right worker count. If queue grows but CPU is idle, workers may be crashing or stuck.

## 6. The Traps — What Goes Wrong

**Using worker threads for I/O.** `await fetch(url)` inside a worker works, but you've gained nothing — the main thread handles async I/O fine. You've added serialization overhead and complexity for no benefit.

**Creating a worker per request.** A PDF service that spawns a new worker for every upload will spend more time starting workers than parsing PDFs. Use a pool.

**Passing huge objects via postMessage.** Structured clone copies the entire object. A 50MB buffer gets copied twice. Use `SharedArrayBuffer` or pass a file path and let the worker read it directly.

**No error handlers on workers.** A worker that throws an unhandled exception dies silently from the parent's perspective if you never attached `on('error')`. Tasks in the queue hang forever.

**Too many workers.** More threads than CPU cores causes context-switching overhead. Start with `cpus().length - 1`, measure, adjust.

**Forgetting worker files in deployment.** Workers load a separate `.js` file. If your Docker image or bundler doesn't include `hash-worker.js`, production crashes with `MODULE_NOT_FOUND`.

## 7. Compare With Related Concepts

**Worker threads vs cluster.** Cluster = multiple processes handling requests (horizontal within one machine). Worker threads = multiple threads handling CPU tasks within one process. Rule: cluster distributes requests; worker threads parallelize computation.

**Worker threads vs child_process.** `child_process.fork()` spawns a full Node.js process — heavier, full isolation, can run separate scripts. Worker threads are lighter and designed for parallel JS execution with optional shared memory.

**Worker threads vs running a separate service.** For very heavy work (video transcoding, ML models), a dedicated microservice or job queue (Bull, SQS) may be simpler than in-process workers. Rule: worker threads for milliseconds-to-seconds of CPU work co-located with your API; separate services for minutes of work.

**Worker threads vs `setImmediate` / breaking up work.** Chunking a loop with `setImmediate` yields to the event loop but doesn't use multiple cores. It helps responsiveness on one core; workers use all cores.

## 8. 🧠 The Memory Hook — What Sticks

Node's main thread is a single cashier — async I/O lets them serve the next customer while the kitchen cooks, but CPU work makes them stop and grind beans while everyone waits. Worker threads are prep staff in the back: same building, parallel hands, main thread stays on the floor.
