# What is Cluster Module

## 1. Why This Exists — The Problem First

Your Node API runs on a 16-core server. One Node process uses **one CPU core**. The other 15 cores sit idle while that single event loop handles every request. You scale traffic and CPU hits 100% on one core; latency spikes; the rest of the machine does nothing useful.

Node's default model is one thread of JavaScript execution per process. The **cluster module** forks multiple Node **worker processes** that share the same server port. Incoming connections distribute across workers. You use all cores on the machine without rewriting your app in another language.

## 2. The Analogy — Make It Obvious

Picture a **restaurant chain with one front door**.

- The **master process** is headquarters — it does not serve customers; it opens branches.
- Each **worker** is a separate restaurant branch — same menu (same app code), own staff (own V8 heap, own event loop), own kitchen memory.
- Customers (TCP connections) arrive at the shared front door (port 80). The OS or master **rotates** customers across branches — round-robin scheduling.
- If one branch burns down (worker crash), headquarters opens a replacement. Other branches keep serving.

Critical detail: branches do **not** share a fridge. In-memory state in worker A is invisible to worker B. Put shared state in Redis or a database, not in a module-level variable.

## 3. How It Actually Works — The Full Explanation

**Master vs worker.**

```js
const cluster = require("cluster");

if (cluster.isPrimary) {  // was isMaster — isPrimary in modern Node
  // fork workers
} else {
  // run HTTP server / app
}
```

On startup, the master calls `cluster.fork()` — which uses `child_process.fork()` to spawn a child running the **same entry file**. The child gets its own V8 isolate, memory, and event loop.

**Sharing a port.** Workers call `server.listen(3000)`. The master coordinates so multiple processes bind to the same port. On Linux, the kernel or Node's round-robin distributes new connections across workers.

**Scheduling.** Default is round-robin among workers (behavior varies slightly by OS). Not sticky — consecutive requests from the same client may hit different workers.

**No shared memory.** Each worker has a full copy of your app's heap. A 200 MB baseline app × 8 workers ≈ 1.6 GB RAM before handling traffic. In-memory sessions, caches, or rate-limit counters per worker are **not** shared unless you use external storage.

**IPC.** Master and workers communicate via inter-process messages: `worker.send(msg)`, `process.on('message')`. Useful for admin tasks; not for hot request path data.

**Worker crash recovery.** Master listens for `'exit'` on workers and can `cluster.fork()` a replacement. Provides fault isolation — one worker OOM does not kill siblings.

**When cluster helps.** CPU-bound JavaScript on the request path — heavy JSON parsing, image resizing in pure JS, crypto without native offload. **When it does not help much:** typical I/O-bound APIs where one event loop already waits on DB/network efficiently. Cluster adds memory overhead without throughput gain for purely async I/O work.

**Production reality.** Many teams use **PM2**, Kubernetes replicas, or a load balancer instead of raw cluster. Same idea — multiple processes — with better ops tooling, graceful reload, and health checks.

## 4. Real Code — See It Working

**Basic cluster HTTP server**

```js
const cluster = require("cluster");
const http = require("http");
const os = require("os");

if (cluster.isPrimary) {
  const cpuCount = os.cpus().length;
  console.log(`master ${process.pid} forking ${cpuCount} workers`);

  for (let i = 0; i < cpuCount; i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code) => {
    console.log(`worker ${worker.process.pid} exited (${code}), restarting`);
    cluster.fork(); // WHY: replace crashed worker
  });
} else {
  http.createServer((req, res) => {
    res.end(`handled by worker ${process.pid}\n`);
  }).listen(3000);

  console.log(`worker ${process.pid} listening`);
}
```

**Graceful shutdown**

```js
if (cluster.isPrimary) {
  process.on("SIGTERM", () => {
    for (const id in cluster.workers) {
      cluster.workers[id].process.kill("SIGTERM");
    }
  });
} else {
  const server = http.createServer(handler);
  server.listen(3000);
  process.on("SIGTERM", () => {
    server.close(() => process.exit(0)); // WHY: finish in-flight requests
  });
}
```

**External session store — required with cluster**

```js
// BAD with cluster — session lives in one worker's memory
const sessions = {};
app.get("/login", (req, res) => { sessions[req.userId] = token; });

// GOOD — Redis shared across all workers
const redis = require("redis").createClient();
app.get("/login", async (req, res) => {
  await redis.set(`session:${req.userId}`, token, "EX", 3600);
});
```

**IPC example — master broadcasts config**

```js
if (cluster.isPrimary) {
  for (const id in cluster.workers) {
    cluster.workers[id].send({ type: "config", maxRate: 100 });
  }
} else {
  process.on("message", (msg) => {
    if (msg.type === "config") applyRateLimit(msg.maxRate);
  });
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the cluster module?**

A Node.js core module that forks multiple worker processes sharing the same server port. The master process spawns workers (each with its own V8 instance and event loop); incoming connections distribute across workers, utilizing multiple CPU cores on one machine.

**Q: Do cluster workers share memory?**

No. Each worker is a separate OS process with its own heap. A module-level cache in one worker is not visible to others. Use Redis, Memcached, or a database for shared state. Memory usage scales roughly with worker count.

**Q: How are connections distributed?**

Round-robin among workers by default (OS scheduling may vary). Requests from the same user are **not** guaranteed to hit the same worker — use sticky sessions (load balancer cookie) or external session storage if you need affinity.

**Q: What happens when a worker crashes?**

The master receives an `'exit'` event. Other workers keep serving. The master can fork a replacement. One bad request taking down a worker does not take down the entire server if recovery is implemented.

**Q: Cluster vs worker threads — when to use which?**

**Cluster** — multiple processes, full isolation, share a port, best for scaling CPU-bound work across cores with separate memory per worker. **Worker threads** — threads within one process, shared memory possible via `SharedArrayBuffer`, lower overhead, better for offloading a CPU task without duplicating the whole app. Use cluster for HTTP server scaling; worker threads for parallelizing a heavy computation inside one request.

**Q: Should you use raw cluster in production?**

It works, but PM2, container orchestration (K8s replicas), or a reverse proxy + multiple instances often provide graceful reload, health checks, and logging with less custom code. Understand cluster; deploy with process management.

## 6. The Traps — What Goes Wrong

**In-memory sessions with cluster.** User logs in on worker 1; next request hits worker 2 — session missing. Fix: Redis/database sessions.

**Assuming cluster speeds up I/O-bound APIs.** One event loop already multiplexes thousands of concurrent DB/network waits. Eight workers × I/O-bound app often means 8× memory for modest gain. Profile first.

**Memory multiplication ignored.** 8 workers × 300 MB baseline = 2.4 GB before traffic. Size the machine accordingly.

**Master does heavy work.** Only the master should fork; workers run the server. If you accidentally run the server in the master too, you waste a core and confuse lifecycle.

**No graceful shutdown.** Killing workers mid-request drops connections. Use `server.close()` on SIGTERM.

**Relying on cluster for sticky WebSockets without planning.** Round-robin breaks unless the load balancer pins connections. Terminate WebSockets at a dedicated service or use sticky sessions.

## 7. Compare With Related Concepts

**Cluster vs PM2 cluster mode**

Same fork-multiple-processes idea. PM2 adds auto-restart, log aggregation, zero-downtime reload, and monitoring. Cluster module is the primitive; PM2 is ops-friendly wrapping.

**Cluster vs horizontal scaling (multiple machines)**

Cluster scales **one machine's cores**. Horizontal scaling adds machines behind a load balancer. Production often does both — several machines, each running PM2/cluster with N workers.

**Cluster vs worker threads**

Processes (cluster) = isolated memory, higher overhead, share port via master. Threads (worker_threads) = shared address space possible, lower spawn cost, no automatic port sharing. Different tools for different parallelism problems.

**Cluster vs async I/O**

Async I/O solves waiting on disk/network without blocking the thread. Cluster solves using multiple CPU cores when JavaScript computation is the bottleneck. Not interchangeable.

## 8. 🧠 The Memory Hook — What Sticks

Cluster is **one front door, many identical restaurants** — each worker is its own process with its own memory. Customers rotate across branches; branches do not share a fridge. Use Redis for shared state, restart dead workers from the master, and reach for cluster when **CPU** is the limit, not when you are just waiting on the database.
