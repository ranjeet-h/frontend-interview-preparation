# How do you avoid blocking Node.js

## 1. Why This Exists — The Problem First

You inherited a Node API that "worked in staging." Under real traffic, responses crawl, Kubernetes kills pods on failed health checks, and someone suggests "just add more replicas." Replicas help — until each one still has a sync `readFileSync` in middleware and a password hash running on the main thread. You are paying for ten processes that all freeze the same way.

Avoiding blocking is not a style preference in Node. It is how you keep the one JavaScript thread available for every open connection. The fix is not one trick; it is matching **type of blocking** to the right tool: async I/O, streaming, chunking, workers, validation, and observability.

## 2. The Analogy — Make It Obvious

Think of the event loop as the **only checkout lane** in a busy store.

- **Async I/O** — send restocking to the warehouse (libuv) instead of standing in the aisle counting boxes yourself (sync read).
- **Streaming** — scan items one at a time instead of piling the entire cart onto the belt at once (load 1GB into memory).
- **`setImmediate` chunking** — process ten customers, let the lane breathe, process ten more (light CPU on main thread).
- **Worker threads** — open a second checkout in another room for heavy tasks (image resize, bcrypt) while the main lane keeps moving.
- **Input limits** — refuse absurdly large carts before they jam the belt (payload size, safe regex).
- **Monitoring** — a queue-length camera (`monitorEventLoopDelay`) so you see jams before customers leave.

Different jams, different fixes — one lane still serves everyone if you manage it deliberately.

## 3. How It Actually Works — The Full Explanation

**1. Use async I/O everywhere in hot paths**

Replace `readFileSync` with `fs.promises.readFile` or streams. Use non-blocking database drivers (`await pool.query(...)`). Never call sync crypto in request handlers — use async `pbkdf2`, `scrypt`, or offload to workers.

**2. Stream large data**

For uploads, downloads, CSV export, log tailing — `createReadStream`, `pipeline`, HTTP `res` piping. Constant memory, incremental processing, earlier bytes to the client.

**3. Chunk light CPU on the main thread**

For arrays that are too big for one tick but not worth a worker: process N items, `setImmediate` to continue. Tune chunk size by measuring event loop lag — typically hundreds to thousands of items, not millions per tick.

**4. Offload heavy CPU to worker threads**

Image processing, PDF generation, large bcrypt rounds — `worker_threads` or a job queue (Bull, SQS + worker service). Do not spawn a new Worker per request; use a **pool** to amortize startup cost.

**5. Validate and bound untrusted input**

Limit JSON body size, reject oversized strings before `JSON.parse`, use safe regex or timeout libraries, sanitize paths before file ops.

**6. Monitor event loop lag**

`perf_hooks.monitorEventLoopDelay()`, APM latency vs CPU, p95/p99 request times. Alert on lag before users notice.

**7. Scale out only after the process is clean**

Cluster mode and multiple containers multiply throughput for **non-blocking** apps. Blocking code just multiplies frozen processes.

## 4. Real Code — See It Working

**Async I/O instead of sync:**

```js
const fs = require("fs/promises");

async function readConfig(path) {
  // WHY: yields thread during disk I/O
  return fs.readFile(path, "utf8");
}

readConfig(__filename).then((text) => console.log("config bytes:", text.length));
```

**Streaming a file instead of loading it:**

```js
const fs = require("fs");
const { pipeline } = require("stream/promises");
const zlib = require("zlib");

async function gzipFile(input, output) {
  await pipeline(
    fs.createReadStream(input),
    zlib.createGzip(),
    fs.createWriteStream(output)
  );
  console.log("gzip done");
}

gzipFile(__filename, `${__filename}.gz`).catch(console.error);
```

**Chunk CPU with `setImmediate`:**

```js
function sumLargeArray(length, chunkSize) {
  const arr = Array.from({ length }, (_, i) => i);
  let i = 0;
  let sum = 0;

  return new Promise((resolve) => {
    function chunk() {
      const end = Math.min(i + chunkSize, arr.length);
      for (; i < end; i++) sum += arr[i];

      if (i < arr.length) {
        setImmediate(chunk);
      } else {
        resolve(sum);
      }
    }
    chunk();
  });
}

sumLargeArray(2_000_000, 200_000).then((total) => console.log("sum:", total));
```

**Worker thread for CPU-heavy hash (minimal pattern):**

```js
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const crypto = require("crypto");

if (isMainThread) {
  const worker = new Worker(__filename, { workerData: { password: "secret" } });
  worker.on("message", (hash) => console.log("hash:", hash.slice(0, 16) + "..."));
  worker.on("error", console.error);
} else {
  const hash = crypto.pbkdf2Sync(workerData.password, "salt", 100_000, 32, "sha512");
  parentPort.postMessage(hash.toString("hex"));
}
```

**Event loop lag monitor:**

```js
const { monitorEventLoopDelay } = require("perf_hooks");

const h = monitorEventLoopDelay({ resolution: 20 });
h.enable();

setInterval(() => {
  const p99 = h.percentile(99) / 1e6;
  if (p99 > 50) console.warn("high event loop delay p99 (ms):", p99.toFixed(1));
}, 2000);
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you avoid blocking the Node.js event loop?**

Use async I/O, stream large payloads, chunk moderate CPU with `setImmediate`, move heavy CPU to worker threads or external services, bound and validate input, and monitor event loop delay.

**Q: When use worker threads vs `setImmediate`?**

Workers for heavy parallel CPU (crypto, image work, big transforms) on separate threads. `setImmediate` for moderate loops that can share the main thread in slices. Workers have startup and messaging overhead — pools help.

**Q: Does `async/await` make code non-blocking?**

Only when awaiting real async operations. Sync calls inside `async` functions still block.

**Q: Why stream instead of `readFile`?**

Constant memory and incremental processing. Reading a 2GB file into a string allocates 2GB and blocks during parse — streams process chunks as they arrive.

**Q: How do you prevent ReDoS?**

Limit input length, avoid vulnerable regex patterns (nested quantifiers), use libraries with timeouts, validate with simpler checks first.

## 6. The Traps — What Goes Wrong

**Trap: New Worker per request.** Thread startup can cost more than the work. Pool and reuse.

**Trap: Wrong tool — workers for I/O.** Workers do not replace async `fs` or network; I/O is already non-blocking via libuv.

**Trap: Tiny `setImmediate` chunks.** Overhead dominates; lag still spikes with huge chunk sizes. Measure.

**Trap: Streaming without error handlers.** Unhandled `'error'` events crash the process. Use `pipeline()` which forwards errors.

**Trap: Scaling replicas to hide blocking.** You multiply cost and still get bad latency per pod.

## 7. Compare With Related Concepts

| Strategy | Blocks main thread? | Best for |
|---|---|---|
| Async I/O | No (during wait) | Disk, network, DB |
| Streams | No (per chunk) | Large files, HTTP bodies |
| `setImmediate` chunking | Brief slices | Medium arrays on main thread |
| Worker threads | No (work off-thread) | Heavy CPU |
| Cluster | Per-process threads | Multi-core + isolation |
| External job queue | Off request path | Long-running jobs |

**vs non-blocking I/O:** Avoiding blocking is the **practice**; non-blocking I/O is the **default I/O model** you must not undermine with sync calls.

**Rule:** Match the blocker — I/O → async/stream; CPU → chunk or worker; untrusted input → validate first.

## 8. 🧠 The Memory Hook — What Sticks

Keep the **one checkout lane** moving: **async I/O** for waiting, **streams** for size, **`setImmediate`** for light slicing, **workers** for heavy CPU, **limits** for bad input, **lag metrics** to catch jams before customers bail.
