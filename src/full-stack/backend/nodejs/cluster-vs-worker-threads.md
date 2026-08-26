# Cluster vs worker threads

## 1. Why This Exists — The Problem First

You have a 16-core server running a single Node.js process. `htop` shows one core at 100% and fifteen cores idle. You add worker threads to parallelize image resizing inside each request — throughput improves for uploads, but your health-check endpoint still queues behind 2,000 concurrent API calls because there's only one process accepting connections.

Then you switch to cluster, fork 16 workers, and suddenly you handle 16× more concurrent requests — but each worker still chokes when someone triggers a CPU-heavy report because you offloaded nothing off the event loop.

These two tools solve different problems. Picking the wrong one — or using only one — leaves performance on the table and confuses interviewers who want to hear you reason about *request parallelism* vs *task parallelism*.

## 2. The Analogy — Make It Obvious

Think of a delivery company.

**Cluster** is opening multiple independent branch offices. Each office has its own staff, own phone line, own filing cabinets. When a customer calls, the central dispatcher routes them to whichever office is free. If one office burns down, the others keep operating. But if Office A needs a document from Office B's filing cabinet, someone has to fax it over — slow, and copies don't share the same drawer.

**Worker threads** are extra desks inside one office. Everyone works in the same building, shares the same filing cabinet (shared memory), and passes notes directly across the room. Fast collaboration, but if the building's power fails, everyone stops.

Cluster scales how many customers you serve at once. Worker threads scale how fast one customer request gets processed when it needs heavy internal work.

## 3. How It Actually Works — The Full Explanation

| | Cluster | Worker threads |
|---|---|---|
| Unit of parallelism | OS process | OS thread |
| Memory | Separate heap per process | Shared process memory; optional `SharedArrayBuffer` |
| Communication | IPC (`process.send`, JSON serialization) | `postMessage`, shared memory |
| V8 instances | One per process | One per worker |
| Event loops | One per process | One per worker + main |
| Fault isolation | Worker crash → other processes survive | Thread crash → can kill entire process |
| Startup cost | High (full process fork) | Medium (lighter than fork) |
| Best for | Distributing HTTP connections across cores | CPU-bound work within a request |

**Cluster** (`cluster` module): a master process forks N worker processes (typically one per CPU core). The OS or Node distributes incoming TCP connections across workers. Each worker runs your full server — Express, database pool, everything. Memory is duplicated: 8 workers ≈ 8× baseline RAM.

**Worker threads** (`worker_threads` module): the main thread spawns threads inside one process. Used to offload synchronous CPU work — hashing, image resize, PDF parse — while the main event loop keeps accepting I/O. Workers share the process address space.

**The production combo:** cluster workers each run a server *and* each maintains a worker-thread pool for CPU tasks. Outer layer: request distribution and fault isolation. Inner layer: CPU parallelism within a request.

```text
Load Balancer
    └── Machine (16 cores)
            └── cluster master
                    ├── worker process 1 → HTTP server + worker thread pool
                    ├── worker process 2 → HTTP server + worker thread pool
                    └── ... (one per core)
```

When to use which:

- **Only cluster:** I/O-bound API, no heavy CPU per request, need multi-core request handling
- **Only worker threads:** Single-process deployment (serverless, container with 1 CPU), CPU-heavy tasks
- **Both:** High-traffic API with occasional CPU-heavy endpoints on multi-core machines

## 4. Real Code — See It Working

**Cluster — multi-core HTTP server**

```javascript
const cluster = require('cluster');
const os = require('os');
const express = require('express');

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  console.log(`Primary ${process.pid} forking ${numCPUs} workers`);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code) => {
    console.error(`Worker ${worker.process.pid} died (${code}), restarting`);
    cluster.fork(); // replace crashed worker
  });
} else {
  const app = express();

  app.get('/api/users', async (req, res) => {
    const users = await db.query('SELECT * FROM users LIMIT 50');
    res.json(users);
  });

  app.listen(3000, () => {
    console.log(`Worker ${process.pid} listening on :3000`);
  });
}
```

**Worker threads — CPU work inside one process**

```javascript
const { Worker } = require('worker_threads');
const express = require('express');
const app = express();

function generateReport(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./report-worker.js', { workerData: data });
    worker.on('message', resolve);
    worker.on('error', reject);
  });
}

app.post('/api/reports', async (req, res) => {
  // Main thread stays free for other requests while worker crunches numbers
  const report = await generateReport(req.body);
  res.json(report);
});

app.listen(3000);
```

**Combined — cluster + worker thread pool per process**

```javascript
const cluster = require('cluster');
const os = require('os');
const { Worker } = require('worker_threads');

class WorkerPool {
  constructor(script, size) {
    this.workers = Array.from({ length: size }, () => new Worker(script));
    this.free = [...this.workers];
    this.queue = [];
  }
  run(data) {
    return new Promise((resolve, reject) => {
      this.queue.push({ data, resolve, reject });
      this._dispatch();
    });
  }
  _dispatch() { /* assign task to free worker */ }
}

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) cluster.fork();
} else {
  // Each cluster worker gets its own thread pool (e.g. 2 threads)
  const pool = new WorkerPool('./image-resize.js', 2);
  // Express routes call pool.run() for CPU-heavy endpoints
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the main difference between cluster and worker threads?**

Cluster creates separate processes for request-level parallelism — each process handles its own connections with isolated memory. Worker threads create threads within one process for task-level parallelism — CPU-heavy work inside a request without blocking the event loop.

**Q: When would you use cluster?**

When a single Node.js process can't use all CPU cores for handling concurrent requests. Typical for HTTP servers on multi-core machines. Also when you want fault isolation — one crashed worker doesn't take down siblings.

**Q: When would you use worker threads?**

When a single request needs CPU-intensive synchronous JavaScript — image processing, PDF generation, bcrypt, large JSON transforms — and you want the main event loop to stay responsive for other requests in the same process.

**Q: Can you use both together?**

Yes, and many production APIs do. Cluster distributes incoming connections across processes. Each process runs a worker-thread pool for CPU-heavy route handlers. This maximizes both connection throughput and per-request compute speed.

**Q: What are the memory implications?**

Cluster duplicates memory — 8 workers with 200MB baseline ≈ 1.6GB before handling traffic. Worker threads share the process heap (except per-worker V8 isolates) — much cheaper for sharing large read-only data.

**Q: What happens when a cluster worker crashes vs a worker thread crashes?**

Cluster worker crash: master detects exit, forks a replacement, other workers keep serving. Worker thread crash: may terminate the entire process if unhandled — all connections on that process die. Cluster provides stronger fault isolation.

## 6. The Traps — What Goes Wrong

**Using cluster to parallelize one heavy computation.** Cluster workers don't share memory efficiently. Passing a 10MB payload between cluster workers serializes over IPC. Use worker threads (or shared memory) for compute inside a request.

**Using worker threads to handle more concurrent connections.** One process with 4 worker threads still has one process accepting connections. Worker threads don't multiply your connection capacity — cluster does.

**Forking cluster workers inside serverless.** AWS Lambda runs one process per invocation. Cluster adds overhead with no benefit. Worker threads may help for CPU work within that single invocation.

**Duplicating database connection pools per cluster worker.** 16 workers × 20 connections = 320 DB connections. Size pools per worker (`pool max = total_limit / num_workers`) or use PgBouncer.

**No worker replacement in cluster.** If a cluster worker dies and you don't `cluster.fork()` a replacement, you permanently lose a core's worth of capacity.

**Assuming PM2 `--instances max` replaces cluster.** PM2 cluster mode uses Node's cluster module under the hood — same trade-offs apply. PM2 adds process management; it doesn't change the architecture.

## 7. Compare With Related Concepts

**Cluster vs horizontal scaling (multiple machines).** Cluster uses all cores on one machine. Horizontal scaling adds machines behind a load balancer. Rule: cluster first on a multi-core box; add machines when one box isn't enough.

**Worker threads vs child_process.** `child_process.fork()` is a full process — heavier, like cluster's unit but for running separate scripts. Worker threads are lighter and designed for parallel JS with message passing.

**Cluster vs nginx load balancing to multiple ports.** You can run multiple Node processes on different ports and let nginx round-robin. Functionally similar to cluster, but cluster handles distribution at the Node level without extra nginx upstream config.

**Worker threads vs job queues (Bull, SQS).** Job queues decouple work across time and machines. Worker threads run work inline during a request. Rule: worker threads for sub-second CPU work that must complete before the HTTP response; job queues for background work.

## 8. 🧠 The Memory Hook — What Sticks

Cluster answers "how do I use all cores for incoming requests?" Worker threads answer "how do I not block the event loop on CPU work?" Different questions — branch offices vs extra desks in one office. Production APIs often need both.
