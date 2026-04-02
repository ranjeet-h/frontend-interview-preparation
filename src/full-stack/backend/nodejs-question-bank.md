# Node.js Interview Question Bank

> **50 most-asked Node.js / backend interview questions with practical answers, code examples, and interview takeaways.**
> Covers: core Node.js internals, Express, npm/ESM, streams, buffers, clustering, security, performance, testing, and API design.

---

## Question Index

| # | Question | Group |
|---|----------|-------|
| 1 | What is Node.js and how does it differ from browser JavaScript? | Core Concepts |
| 2 | Explain the Node.js event loop in detail. | Core Concepts |
| 3 | What is the difference between `process.nextTick()`, `setImmediate()`, and `setTimeout()`? | Core Concepts |
| 4 | What is libuv and why does Node.js need it? | Core Concepts |
| 5 | What are the phases of the event loop? | Core Concepts |
| 6 | What is the difference between CommonJS and ES Modules? | Modules & npm |
| 7 | How does `require()` work under the hood? | Modules & npm |
| 8 | What is the `package.json` `exports` field and when should you use it? | Modules & npm |
| 9 | What is the difference between `dependencies`, `devDependencies`, and `peerDependencies`? | Modules & npm |
| 10 | What is the purpose of `package-lock.json` / `npm ci`? | Modules & npm |
| 11 | What are Node.js Streams and what problem do they solve? | Streams & Buffers |
| 12 | What are the four types of streams in Node.js? | Streams & Buffers |
| 13 | What is backpressure and how do you handle it? | Streams & Buffers |
| 14 | What is a Buffer in Node.js? When would you use one? | Streams & Buffers |
| 15 | How do you pipe multiple streams and handle errors correctly? | Streams & Buffers |
| 16 | What is the difference between `cluster` module and `worker_threads`? | Concurrency & Scaling |
| 17 | How does the cluster module distribute incoming connections? | Concurrency & Scaling |
| 18 | What is the `child_process` module and when would you use it? | Concurrency & Scaling |
| 19 | What is the difference between `spawn`, `exec`, `execFile`, and `fork`? | Concurrency & Scaling |
| 20 | How do you share state between worker threads? | Concurrency & Scaling |
| 21 | How do you structure a production-grade Express application? | Express & API Design |
| 22 | What is middleware in Express and how does the middleware chain work? | Express & API Design |
| 23 | How do you handle errors in Express? | Express & API Design |
| 24 | What are the differences between REST and GraphQL APIs from a Node.js perspective? | Express & API Design |
| 25 | How do you implement rate limiting in a Node.js API? | Express & API Design |
| 26 | How do you manage environment variables in Node.js? | Process & Environment |
| 27 | What signals can a Node.js process receive and how do you handle them? | Process & Environment |
| 28 | What is `process.env` and how does it differ between environments? | Process & Environment |
| 29 | How do you perform a graceful shutdown in Node.js? | Process & Environment |
| 30 | What is the role of `process.stdout`, `process.stderr`, and `process.stdin`? | Process & Environment |
| 31 | What are best practices for error handling in Node.js? | Error Handling |
| 32 | What is the difference between operational errors and programmer errors? | Error Handling |
| 33 | How do unhandled promise rejections behave and how should you handle them? | Error Handling |
| 34 | What is a domain in Node.js? Is it still relevant? | Error Handling |
| 35 | How do you create custom error classes in Node.js? | Error Handling |
| 36 | What logging strategies work best for Node.js production apps? | Logging & Observability |
| 37 | What is structured logging and why does it matter? | Logging & Observability |
| 38 | How do you implement distributed tracing in a Node.js microservice? | Logging & Observability |
| 39 | What is the difference between `console.log` and a proper logger like Winston/Pino? | Logging & Observability |
| 40 | How do you expose health-check and metrics endpoints? | Logging & Observability |
| 41 | How do you write unit tests for Node.js applications? | Testing |
| 42 | What is the difference between unit, integration, and end-to-end tests in Node.js? | Testing |
| 43 | How do you mock modules in Jest? | Testing |
| 44 | How do you test asynchronous code in Node.js? | Testing |
| 45 | What is supertest and how is it used to test Express routes? | Testing |
| 46 | What are the most common Node.js security vulnerabilities? | Security |
| 47 | How do you prevent SQL/NoSQL injection in Node.js? | Security |
| 48 | What HTTP security headers should every Node.js API set? | Security |
| 49 | How does `helmet` help secure an Express app? | Security |
| 50 | How do you handle secrets and credentials securely in Node.js? | Security |

---

## Group 1 — Core Concepts

### Q1. What is Node.js and how does it differ from browser JavaScript?

**Answer summary:** Node.js is a server-side JavaScript runtime built on V8 that provides system-level APIs (file system, networking, OS) absent from browsers, and lacks browser-specific APIs (DOM, `window`, `fetch` natively pre-v18).

**Details:**
- Node.js uses the same V8 engine as Chrome but bundles libuv for async I/O and its own C++ bindings.
- No DOM, no `localStorage`, no browser security sandbox.
- Adds `process`, `Buffer`, `require`/`import`, `__dirname`, `__filename`, and the full `node:*` standard library.
- Node.js is single-threaded for JavaScript execution but offloads I/O to the OS thread pool via libuv.

**Example:**
```js
// Browser: not available
// Node.js:
import { readFile } from 'node:fs/promises';

const content = await readFile('./config.json', 'utf8');
console.log(content);
```

**Interview takeaway:** Emphasise the single-threaded event loop combined with non-blocking I/O — that's what makes Node fast for I/O-bound work, not CPU-bound work.

---

### Q2. Explain the Node.js event loop in detail.

**Answer summary:** The event loop is the mechanism that allows Node.js to perform non-blocking I/O by offloading operations to the OS/thread pool and picking up their callbacks when they complete.

**Details:**
Node.js runs JavaScript in a single thread. Blocking calls (file reads, DNS lookups) are handed to libuv's thread pool or the OS kernel (epoll/kqueue). The event loop continuously:
1. Checks for timers whose threshold has expired (`setTimeout`, `setInterval`).
2. Handles pending I/O callbacks.
3. Idles/prepares internally.
4. Polls for new I/O events (blocks here if nothing else is pending).
5. Executes `setImmediate` callbacks (check phase).
6. Runs close callbacks (`socket.on('close', ...)`).

Between each phase, Node.js drains the **microtask queue** — first `process.nextTick` callbacks, then Promise microtasks.

**Interview takeaway:** Blocking the event loop with synchronous CPU work (e.g. a tight loop, `JSON.parse` on a huge payload) stalls ALL requests. Move heavy CPU work to worker threads.

---

### Q3. What is the difference between `process.nextTick()`, `setImmediate()`, and `setTimeout()`?

**Answer summary:** `process.nextTick` fires before the next event loop phase (highest priority). `setImmediate` fires in the check phase after I/O. `setTimeout(fn, 0)` fires in the timers phase, which may be after `setImmediate` depending on context.

**Details:**

| API | Queue | When it runs |
|-----|-------|-------------|
| `process.nextTick(cb)` | nextTick queue (microtask-like) | Before the next event loop phase, after current operation |
| `Promise.then(cb)` | microtask queue | After nextTick queue drains |
| `setImmediate(cb)` | check phase | After I/O callbacks in the current loop iteration |
| `setTimeout(cb, 0)` | timers phase | Next timers phase (≥ 1 ms delay internally) |

**Example:**
```js
setTimeout(() => console.log('timeout'), 0);
setImmediate(() => console.log('immediate'));
process.nextTick(() => console.log('nextTick'));
Promise.resolve().then(() => console.log('promise'));

// Output (inside I/O callback, order is deterministic):
// nextTick → promise → immediate → timeout
```

**Common pitfall:** Recursively calling `process.nextTick` can starve the event loop. Use `setImmediate` for recursive async iteration.

---

### Q4. What is libuv and why does Node.js need it?

**Answer summary:** libuv is a cross-platform C library that provides the event loop, async I/O, thread pool, timers, signals, and child-process support — abstracting OS differences (epoll on Linux, kqueue on macOS, IOCP on Windows).

**Details:**
- Node.js delegates all I/O and OS interactions to libuv.
- The thread pool (default size 4, configurable via `UV_THREADPOOL_SIZE`) is used for operations the OS doesn't support asynchronously (e.g. DNS lookups, file system ops, crypto).
- Network I/O (TCP/UDP) is handled directly by OS non-blocking sockets — no thread pool needed.

**Example:**
```bash
# Increase thread pool for heavy crypto/fs workloads
UV_THREADPOOL_SIZE=16 node server.js
```

**Interview takeaway:** `fs.readFile`, `crypto.pbkdf2`, and DNS use the thread pool — they can still block each other if the pool is exhausted. Use `UV_THREADPOOL_SIZE` tuning or move to worker threads for crypto-heavy workloads.

---

### Q5. What are the phases of the event loop?

**Answer summary:** Six phases: timers → pending callbacks → idle/prepare → poll → check → close callbacks. Microtasks (`nextTick` + Promises) drain between every phase transition.

**Details:**
1. **Timers** – executes `setTimeout`/`setInterval` callbacks whose delay has elapsed.
2. **Pending callbacks** – I/O callbacks deferred to the next loop (e.g. TCP errors).
3. **Idle, prepare** – internal Node.js use only.
4. **Poll** – retrieves new I/O events; blocks if the queue is empty and no timers are pending.
5. **Check** – executes `setImmediate` callbacks.
6. **Close callbacks** – e.g. `socket.on('close')`.

**Interview takeaway:** The poll phase is where Node spends most of its time waiting. A long-running synchronous callback in any phase blocks ALL other callbacks until it returns.

---

## Group 2 — Modules & npm

### Q6. What is the difference between CommonJS and ES Modules?

**Answer summary:** CommonJS (`require`/`module.exports`) is synchronous, dynamic, and the historic Node.js default. ES Modules (`import`/`export`) are static, asynchronous, and the web/JavaScript standard.

**Details:**

| Feature | CommonJS | ESM |
|---------|----------|-----|
| Loading | Synchronous | Asynchronous |
| Binding | Value copy (live bindings for primitives) | Live bindings |
| Top-level `await` | ❌ | ✅ |
| Tree shaking | Limited | Full |
| File extension | `.js` (default CJS) | `.mjs` or `"type":"module"` in package.json |
| `__dirname` / `__filename` | ✅ built-in | ❌ use `import.meta.url` |

**Example (ESM equivalent of `__dirname`):**
```js
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
```

**Common pitfall:** Mixing CJS and ESM in one package requires care. CJS can `require()` CJS only; ESM can `import` both. Use the `exports` field for dual-package builds.

---

### Q7. How does `require()` work under the hood?

**Answer summary:** `require()` resolves the file path, checks the module cache, wraps the file in a function, executes it, and caches `module.exports`. Subsequent `require()` calls of the same module return the cached export.

**Details:**
Node wraps every CJS module in:
```js
(function(exports, require, module, __filename, __dirname) {
  // your module code
});
```
Resolution order: core module → `node_modules` (walking up directories) → file extensions (`.js`, `.json`, `.node`).

**Example — cache busting (rarely needed but asked about):**
```js
// Force a fresh load (e.g. in tests):
delete require.cache[require.resolve('./config')];
const freshConfig = require('./config');
```

**Interview takeaway:** Because modules are cached, singletons (DB connections, config objects) are safe across `require()` calls. Cache busting can be useful in tests but signals a design issue in production code.

---

### Q8. What is the `package.json` `exports` field and when should you use it?

**Answer summary:** The `exports` field defines the public API of your package — controlling which paths are importable and providing different entry points for CJS vs ESM consumers.

**Details:**
```json
{
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    },
    "./utils": "./dist/utils.mjs"
  }
}
```
- Paths not listed in `exports` are **private** — consumers cannot import them.
- Prevents accidental deep imports into internal modules.
- Required for dual CJS/ESM packages.

**Interview takeaway:** Always define `exports` for published packages. It prevents breaking changes when you restructure internals and enables proper tree shaking.

---

### Q9. What is the difference between `dependencies`, `devDependencies`, and `peerDependencies`?

**Answer summary:** `dependencies` are needed at runtime. `devDependencies` are only needed during development/build. `peerDependencies` declare a compatibility contract without bundling the package.

**Details:**

| Field | Installed by consumers? | Use case |
|-------|------------------------|----------|
| `dependencies` | Yes | Express, database drivers |
| `devDependencies` | No (prod install) | Jest, TypeScript, ESLint |
| `peerDependencies` | Must be installed by consumer | React plugins, Babel plugins |
| `optionalDependencies` | Skipped if install fails | Platform-specific native modules |

**Common pitfall:** Publishing a library with React in `dependencies` instead of `peerDependencies` results in duplicate React instances and hook errors.

---

### Q10. What is the purpose of `package-lock.json` and `npm ci`?

**Answer summary:** `package-lock.json` records exact resolved versions of every dependency (including transitive). `npm ci` performs a clean, deterministic install from the lock file — ideal for CI/CD.

**Details:**
- `npm install` updates `package-lock.json` if it can satisfy ranges; `npm ci` fails if the lock file is out of sync with `package.json`.
- `npm ci` deletes `node_modules` before installing — guarantees a clean slate.
- Never `.gitignore` `package-lock.json` for applications; it can be `.gitignore`d for libraries (consumers manage their own lock).

**Example CI workflow:**
```bash
# In CI pipeline — fast, deterministic, fails on mismatch
npm ci

# In local development — resolves ranges, updates lock file
npm install
```

**Interview takeaway:** `npm ci` should always be used in CI/CD. `npm install` in CI risks subtle dependency drift between environments.

---

## Group 3 — Streams & Buffers

### Q11. What are Node.js Streams and what problem do they solve?

**Answer summary:** Streams process data in chunks rather than loading it all into memory, enabling efficient handling of large files, network responses, and real-time data.

**Details:**
Without streams, reading a 2 GB file loads all 2 GB into RAM before processing. With streams, only one chunk (default 64 KB) is in memory at any time.

**Example — stream a file through a transform:**
```js
import { createReadStream, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

await pipeline(
  createReadStream('input.log'),
  createGzip(),
  createWriteStream('input.log.gz')
);
console.log('Done — minimal memory used');
```

**Interview takeaway:** Always prefer `pipeline` over `.pipe()` — it automatically handles errors and cleanup across all streams in the chain.

---

### Q12. What are the four types of streams in Node.js?

**Answer summary:** Readable, Writable, Duplex, and Transform.

**Details:**

| Type | Description | Example |
|------|-------------|---------|
| `Readable` | Source of data | `fs.createReadStream`, `http.IncomingMessage` |
| `Writable` | Destination for data | `fs.createWriteStream`, `http.ServerResponse` |
| `Duplex` | Both readable and writable (independent sides) | TCP socket |
| `Transform` | Duplex where output is computed from input | `zlib.createGzip()`, `crypto.createCipher()` |

**Example — custom Transform:**
```js
import { Transform } from 'node:stream';

const upperCase = new Transform({
  transform(chunk, encoding, callback) {
    callback(null, chunk.toString().toUpperCase());
  }
});

process.stdin.pipe(upperCase).pipe(process.stdout);
```

---

### Q13. What is backpressure and how do you handle it?

**Answer summary:** Backpressure occurs when a writable stream can't consume data as fast as the readable produces it. Ignoring it causes unbounded memory growth.

**Details:**
`writable.write()` returns `false` when the internal buffer exceeds `highWaterMark`. The producer should pause until the `'drain'` event fires.

**Example — manual backpressure handling:**
```js
function pump(readable, writable) {
  readable.on('data', (chunk) => {
    const ok = writable.write(chunk);
    if (!ok) {
      readable.pause();
      writable.once('drain', () => readable.resume());
    }
  });
  readable.on('end', () => writable.end());
}
```

**Better approach — use `pipeline`:** It handles backpressure automatically.

```js
import { pipeline } from 'node:stream/promises';
await pipeline(source, destination); // backpressure managed internally
```

**Interview takeaway:** `pipeline` is the idiomatic answer. Mention manual backpressure to show deep understanding.

---

### Q14. What is a Buffer in Node.js? When would you use one?

**Answer summary:** A `Buffer` is a fixed-size chunk of raw binary memory allocated outside V8's heap. Use it for binary protocols, file I/O, cryptography, and network packets.

**Details:**
- Buffers predate `TypedArray`; they now extend `Uint8Array`.
- Created with `Buffer.from()`, `Buffer.alloc()`, or `Buffer.allocUnsafe()` (uninitialized — fast but contains old data).

**Example:**
```js
// Encoding a string to bytes and back
const buf = Buffer.from('hello', 'utf8');
console.log(buf);            // <Buffer 68 65 6c 6c 6f>
console.log(buf.toString()); // 'hello'

// Safe vs unsafe allocation
const safe   = Buffer.alloc(10);        // zero-filled
const unsafe = Buffer.allocUnsafe(10);  // may contain old memory — fill before use
```

**Common pitfall:** `Buffer.allocUnsafe` contains arbitrary old memory — never expose it to users without filling first. Prefer `Buffer.alloc` unless the performance difference is measurable.

---

### Q15. How do you pipe multiple streams and handle errors correctly?

**Answer summary:** Use `stream.pipeline()` (or `stream/promises` version) instead of chaining `.pipe()`. `pipeline` destroys all streams and propagates errors automatically.

**Details:**
`.pipe()` does **not** forward errors — an error in a middle stream leaves the others open, causing leaks.

**Example:**
```js
import { createReadStream, createWriteStream } from 'node:fs';
import { createBrotliCompress } from 'node:zlib';
import { pipeline } from 'node:stream/promises';

try {
  await pipeline(
    createReadStream('data.csv'),
    createBrotliCompress(),
    createWriteStream('data.csv.br')
  );
} catch (err) {
  console.error('Pipeline failed:', err);
  // All streams already destroyed — no leak
}
```

**Interview takeaway:** The correct answer is always `stream/promises pipeline`. Mentioning `.pipe()` limitations (no error propagation, no automatic cleanup) impresses interviewers.

---

## Group 4 — Concurrency & Scaling

### Q16. What is the difference between `cluster` module and `worker_threads`?

**Answer summary:** `cluster` forks multiple Node.js **processes** to utilise all CPU cores for network I/O. `worker_threads` runs JavaScript in parallel **threads within one process** for CPU-bound work.

**Details:**

| Feature | `cluster` | `worker_threads` |
|---------|-----------|-----------------|
| Memory | Separate heap per process | Shared `ArrayBuffer` / `SharedArrayBuffer` |
| Overhead | Higher (process fork) | Lower (OS thread) |
| Use case | HTTP server scaling | CPU-heavy computation, image processing |
| Crash isolation | Yes — worker crash doesn't kill master | No — uncaught exception kills process |
| IPC | `process.send` / `message` events | `MessageChannel`, `SharedArrayBuffer` |

---

### Q17. How does the cluster module distribute incoming connections?

**Answer summary:** On Linux/macOS the master process accepts connections and distributes them to workers using a round-robin algorithm (default since Node v0.12). On Windows the OS handles distribution.

**Example — basic cluster setup:**
```js
import cluster from 'node:cluster';
import { createServer } from 'node:http';
import { cpus } from 'node:os';

if (cluster.isPrimary) {
  const numCPUs = cpus().length;
  for (let i = 0; i < numCPUs; i++) cluster.fork();

  cluster.on('exit', (worker, code) => {
    console.log(`Worker ${worker.process.pid} died (${code}), restarting…`);
    cluster.fork();
  });
} else {
  createServer((req, res) => res.end(`Handled by PID ${process.pid}`)).listen(3000);
}
```

**Interview takeaway:** In production prefer PM2 (`pm2 start app.js -i max`) or Kubernetes horizontal scaling over manual cluster management — but understanding the internals is expected.

---

### Q18. What is the `child_process` module and when would you use it?

**Answer summary:** `child_process` spawns external processes (shell commands, Python scripts, other binaries) and communicates with them via stdin/stdout/stderr or IPC.

**Use cases:** Running CLI tools, shell scripts, legacy binaries, or CPU-intensive work in an isolated process.

**Example:**
```js
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const { stdout } = await execFileAsync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', 'video.mp4']);
const metadata = JSON.parse(stdout);
```

**Common pitfall:** Never pass unsanitised user input to `exec()` — it interprets shell metacharacters and is vulnerable to command injection. Prefer `execFile` or `spawn` which do NOT invoke a shell.

---

### Q19. What is the difference between `spawn`, `exec`, `execFile`, and `fork`?

**Answer summary:**
- `spawn` — streams stdout/stderr, no shell, best for long-running processes or large output.
- `exec` — buffers stdout/stderr, uses shell, limited by `maxBuffer`.
- `execFile` — like `exec` but NO shell (safer for user input).
- `fork` — specialised `spawn` for Node.js scripts with built-in IPC channel.

**Example:**
```js
import { spawn, exec, execFile, fork } from 'node:child_process';

// Large output — use spawn (streaming)
const ls = spawn('ls', ['-la', '/usr/local/bin']);
ls.stdout.pipe(process.stdout);

// Short output — exec is convenient
exec('git log --oneline -10', (err, stdout) => console.log(stdout));

// User-supplied path — execFile (no shell injection risk)
execFile('/usr/bin/convert', [userInputFile, 'output.png'], cb);

// Node.js sub-process with IPC
const worker = fork('./worker.js');
worker.send({ task: 'compute', data: [...] });
worker.on('message', (result) => console.log(result));
```

---

### Q20. How do you share state between worker threads?

**Answer summary:** Use `SharedArrayBuffer` for raw shared memory with `Atomics` for synchronisation, or pass data via `MessageChannel` by structured clone (copy) or transferable objects.

**Example — SharedArrayBuffer with Atomics:**
```js
import { Worker, isMainThread, workerData } from 'node:worker_threads';

if (isMainThread) {
  const shared = new SharedArrayBuffer(4);
  const arr = new Int32Array(shared);

  const worker = new Worker(new URL(import.meta.url), { workerData: { shared } });
  worker.on('exit', () => console.log('Counter:', arr[0]));
} else {
  const arr = new Int32Array(workerData.shared);
  for (let i = 0; i < 1_000_000; i++) Atomics.add(arr, 0, 1);
}
```

**Interview takeaway:** Prefer message passing (no shared state) for simplicity. Use `SharedArrayBuffer` + `Atomics` only when you need high-throughput shared data and understand the race condition risks.

---

## Group 5 — Express & API Design

### Q21. How do you structure a production-grade Express application?

**Answer summary:** Separate concerns into layers: routes → controllers → services → data access. Keep middleware in its own directory. Never put business logic in route handlers.

**Recommended structure:**
```
src/
  app.js          # Express app setup (no listen)
  server.js       # HTTP server bootstrap (listen, shutdown)
  routes/         # Route declarations only
  controllers/    # Request/response handling
  services/       # Business logic
  repositories/   # DB access layer
  middleware/     # Auth, validation, error handler
  config/         # Environment config
  utils/          # Pure helpers
```

**Example — thin controller:**
```js
// controllers/users.js
export async function getUser(req, res, next) {
  try {
    const user = await userService.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Not found' });
    res.json(user);
  } catch (err) {
    next(err); // delegate to error-handling middleware
  }
}
```

**Interview takeaway:** Keeping `app.js` free of `app.listen` makes it trivially testable with `supertest` without binding a port.

---

### Q22. What is middleware in Express and how does the middleware chain work?

**Answer summary:** Middleware is a function `(req, res, next)` that has access to the request/response cycle. `next()` passes control to the next middleware; `next(err)` skips to error-handling middleware.

**Details:**
- **Application-level:** `app.use(fn)` or `app.get('/path', fn)`
- **Router-level:** `router.use(fn)`
- **Error-handling:** four-argument function `(err, req, res, next)`
- **Third-party:** `express.json()`, `cors()`, `helmet()`

**Example — custom middleware:**
```js
// Request timing middleware
function timing(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} — ${Date.now() - start}ms`);
  });
  next();
}

app.use(timing);
```

**Common pitfall:** Forgetting to call `next()` (or `next(err)`) causes the request to hang forever with no response.

---

### Q23. How do you handle errors in Express?

**Answer summary:** Centralise error handling in a four-argument middleware registered after all routes. Always call `next(err)` from async route handlers.

**Example:**
```js
// Async wrapper to avoid try/catch boilerplate
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Route using wrapper
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    throw err;
  }
  res.json(user);
}));

// Centralised error handler (must be last)
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  const message = status < 500 ? err.message : 'Internal server error';
  res.status(status).json({ error: message });
  if (status >= 500) console.error(err); // log unexpected errors only
});
```

---

### Q24. What are the differences between REST and GraphQL APIs from a Node.js perspective?

**Answer summary:** REST maps resources to URLs with HTTP verbs; GraphQL exposes a single endpoint where clients request exactly the fields they need, eliminating over/under-fetching.

**Details:**

| Concern | REST | GraphQL |
|---------|------|---------|
| Endpoint | Multiple (`/users`, `/posts`) | Single (`/graphql`) |
| Over-fetching | Common | Eliminated by field selection |
| Versioning | URL (`/v2/`) or header | Schema evolution with deprecation |
| Caching | HTTP cache (CDN-friendly) | Requires persisted queries for CDN |
| N+1 problem | Avoidable by design | Requires DataLoader pattern |
| Node.js lib | Express / Fastify | Apollo Server, Pothos, Yoga |

**Interview takeaway:** Neither is universally better. REST is simpler for public APIs; GraphQL shines for complex UIs with many data relationships or many client types.

---

### Q25. How do you implement rate limiting in a Node.js API?

**Answer summary:** Use a middleware like `express-rate-limit` with a Redis-backed store for distributed environments. Always rate limit before heavy processing.

**Example:**
```js
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';

const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: new RedisStore({ sendCommand: (...args) => redis.sendCommand(args) }),
  handler: (req, res) => res.status(429).json({ error: 'Too many requests' }),
});

app.use('/api/', limiter);
```

**Interview takeaway:** In-memory stores don't work across multiple server instances — always use Redis (or similar) in horizontally-scaled deployments.

---

## Group 6 — Process & Environment

### Q26. How do you manage environment variables in Node.js?

**Answer summary:** Use `.env` files (loaded via `dotenv` or Node's native `--env-file` flag in v20.6+) for local development. In production, inject via the deployment platform (Kubernetes secrets, AWS Parameter Store, etc.). Never commit `.env` to git.

**Example:**
```js
// Node v20.6+ — no package needed
// node --env-file=.env server.js

// Pre-v20 with dotenv
import 'dotenv/config';

const config = {
  port:    Number(process.env.PORT ?? 3000),
  dbUrl:   process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
};

// Validate at startup — fail fast
if (!config.dbUrl) throw new Error('DATABASE_URL is required');
```

**Interview takeaway:** Validate all required env vars at startup so the process crashes immediately with a clear message rather than failing silently at runtime.

---

### Q27. What signals can a Node.js process receive and how do you handle them?

**Answer summary:** `SIGTERM` (graceful shutdown request), `SIGINT` (Ctrl+C), `SIGHUP` (terminal closed / config reload). Register handlers with `process.on('SIGNAL', handler)`.

**Example — graceful shutdown:**
```js
const signals = ['SIGTERM', 'SIGINT'];

for (const signal of signals) {
  process.on(signal, async () => {
    console.log(`Received ${signal}, shutting down…`);
    await server.close();          // stop accepting new connections
    await db.destroy();            // close DB pool
    process.exit(0);
  });
}
```

**Interview takeaway:** Kubernetes sends `SIGTERM` before killing a pod. Without a handler, in-flight requests are dropped. Always handle `SIGTERM` for zero-downtime deployments.

---

### Q28. What is `process.env` and how does it differ between environments?

**Answer summary:** `process.env` is a plain object populated from the OS environment at process start. Values are always **strings** — always parse/coerce numbers and booleans.

**Example:**
```js
const port = Number(process.env.PORT) || 3000;           // string → number
const debug = process.env.DEBUG === 'true';               // string → boolean
const level = process.env.LOG_LEVEL ?? 'info';            // with default
```

**Common pitfall:** `process.env.FEATURE_FLAG === true` is always `false` — the value is the string `"true"`, not the boolean. Always compare strings explicitly.

---

### Q29. How do you perform a graceful shutdown in Node.js?

**Answer summary:** Stop accepting new connections, wait for in-flight requests to complete, close database/queue connections, then exit. Set a hard timeout to force exit if shutdown takes too long.

**Example:**
```js
async function shutdown(signal) {
  console.log(`${signal} received — graceful shutdown`);

  // 1. Stop accepting new HTTP requests
  server.close(async () => {
    try {
      // 2. Drain connections
      await Promise.all([
        db.end(),
        redisClient.quit(),
        messageQueue.close(),
      ]);
      console.log('Clean shutdown complete');
      process.exit(0);
    } catch (err) {
      console.error('Error during shutdown:', err);
      process.exit(1);
    }
  });

  // 3. Force exit after 30 seconds
  setTimeout(() => {
    console.error('Forced exit after timeout');
    process.exit(1);
  }, 30_000).unref(); // .unref() prevents this timer from keeping the process alive
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

---

### Q30. What is the role of `process.stdout`, `process.stderr`, and `process.stdin`?

**Answer summary:** `stdin` is a readable stream for input. `stdout` is a writable stream for standard output (line-buffered). `stderr` is a writable stream for errors/diagnostics — not subject to output redirection of stdout.

**Details:**
- `console.log` writes to `stdout`; `console.error` writes to `stderr`.
- Use `stderr` for logs and diagnostics so piped stdout remains clean data.
- `process.stdout.isTTY` — `true` when connected to a terminal, `undefined` in pipes/CI.

**Example — TTY-aware output:**
```js
if (process.stdout.isTTY) {
  console.log('\x1b[32m✔ Success\x1b[0m'); // coloured for terminal
} else {
  console.log('Success');                    // plain for CI logs
}
```

---

## Group 7 — Error Handling

### Q31. What are best practices for error handling in Node.js?

**Answer summary:** Never swallow errors. Use centralised error middleware in Express. Distinguish operational errors (expected) from programmer errors (bugs). Always log unexpected errors with full context.

**Key practices:**
1. Wrap async route handlers so all rejections flow to `next(err)`.
2. Centralise all error responses in one Express error-handling middleware.
3. Exit the process on unrecoverable programmer errors (let a process manager restart it).
4. Include request ID in every error log for traceability.
5. Never expose internal stack traces to API clients in production.

**Example:**
```js
// Global safety nets — log and exit on truly unexpected errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1); // state is corrupted — restart
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
  process.exit(1);
});
```

---

### Q32. What is the difference between operational errors and programmer errors?

**Answer summary:** **Operational errors** are expected runtime failures (network timeout, file not found, invalid user input). **Programmer errors** are bugs (TypeError, off-by-one, null dereference). Handle operational errors gracefully; treat programmer errors as fatal.

**Details:**

| Type | Example | Response |
|------|---------|----------|
| Operational | DB connection refused | Retry with backoff, return 503 |
| Operational | User sends invalid JSON | Return 400 |
| Programmer | `Cannot read property of undefined` | Crash + restart |
| Programmer | Wrong function signature called | Crash + restart |

**Example — custom operational error:**
```js
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

throw new AppError('User not found', 404);
```

---

### Q33. How do unhandled promise rejections behave and how should you handle them?

**Answer summary:** In Node.js v15+ unhandled rejections **crash the process** (exit code 1). Before that they only printed a warning. Always handle rejections either with `.catch()` or `try/catch` in async functions.

**Example:**
```js
// BAD — rejection is unhandled in older Node versions, crash in v15+
fetchData().then(process);

// GOOD — explicit catch
fetchData().then(process).catch(console.error);

// GOOD — async/await
try {
  const data = await fetchData();
  process(data);
} catch (err) {
  console.error('fetchData failed:', err);
}

// Global fallback (should only log + exit, not suppress)
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
```

---

### Q34. What is a domain in Node.js? Is it still relevant?

**Answer summary:** Domains were an early mechanism to catch async errors by associating callbacks with a context. They are **deprecated** and should not be used in new code. Use `async_hooks` or proper `try/catch` with async/await instead.

**Interview takeaway:** The correct modern answer is async/await + centralised error middleware + `unhandledRejection` handler. Mentioning that domains are deprecated shows you're current.

---

### Q35. How do you create custom error classes in Node.js?

**Answer summary:** Extend the built-in `Error` class. Call `super(message)` and `Error.captureStackTrace` to preserve stack traces. Add properties like `statusCode`, `code`, or `isOperational`.

**Example:**
```js
class ValidationError extends Error {
  constructor(message, fields) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.fields = fields;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends Error {
  constructor(resource) {
    super(`${resource} not found`);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// In error handler middleware:
app.use((err, req, res, next) => {
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: err.message, fields: err.fields });
  }
  if (err.isOperational) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  console.error(err); // unexpected — log full stack
  res.status(500).json({ error: 'Internal server error' });
});
```

---

## Group 8 — Logging & Observability

### Q36. What logging strategies work best for Node.js production apps?

**Answer summary:** Use structured JSON logging (Pino or Winston), log to `stdout`/`stderr` and let the infrastructure collect logs, use log levels, include request ID in every log line.

**Best practices:**
- **Log levels:** `fatal`, `error`, `warn`, `info`, `debug`, `trace` — set via env var.
- **Never** log to files directly in app code — let your platform (Docker, Kubernetes, systemd) aggregate.
- Include: `timestamp`, `level`, `requestId`, `userId`, `method`, `path`, `statusCode`, `durationMs`.
- Avoid logging PII (emails, passwords, tokens) — even accidentally via `req.body`.

**Example (Pino):**
```js
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: ['req.headers.authorization', 'body.password'],
});
```

---

### Q37. What is structured logging and why does it matter?

**Answer summary:** Structured logging emits each log entry as a JSON object rather than a plain string, making logs machine-parseable, filterable, and queryable in tools like Datadog, Splunk, or CloudWatch.

**Example:**
```js
// Unstructured (hard to query):
console.log(`User 42 logged in from 192.168.1.1 at 2024-01-15`);

// Structured (filterable by userId, ip, event):
logger.info({ userId: 42, ip: '192.168.1.1', event: 'login' }, 'User logged in');
// → {"level":"info","time":1705276800000,"userId":42,"ip":"192.168.1.1","event":"login","msg":"User logged in"}
```

**Interview takeaway:** In a microservices environment you might have millions of log lines per minute. Structured logs let you write queries like `level=error AND service=payments AND userId=42` to debug production issues in seconds.

---

### Q38. How do you implement distributed tracing in a Node.js microservice?

**Answer summary:** Use OpenTelemetry (OTEL) to auto-instrument HTTP, DB, and queue calls. Propagate trace context via HTTP headers (`traceparent`). Export spans to Jaeger, Zipkin, or a commercial APM.

**Example — OTEL setup:**
```js
// tracing.js — import BEFORE everything else
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({ url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```
```bash
node --require ./tracing.js server.js
```

**Interview takeaway:** Auto-instrumentation covers Express routes, Axios/fetch calls, and common DB drivers with zero code changes. Add custom spans for business-critical operations.

---

### Q39. What is the difference between `console.log` and a proper logger like Winston/Pino?

**Answer summary:** `console.log` is synchronous, unstructured, has no log levels, no redaction, and cannot be configured for different environments. Production loggers are async, structured, configurable, and transport-agnostic.

| Feature | `console.log` | Pino / Winston |
|---------|--------------|----------------|
| Output format | Plain string | JSON (structured) |
| Log levels | ❌ | ✅ (`info`, `error`, etc.) |
| Performance | Sync I/O (blocks event loop) | Async writes |
| Redaction | ❌ | ✅ (PII removal) |
| Transports | stdout only | File, HTTP, Datadog, Splunk… |
| Child loggers | ❌ | ✅ (inherit context) |

**Interview takeaway:** Pino is generally preferred over Winston in performance-sensitive services — it's 5-10× faster due to its minimal serialisation overhead.

---

### Q40. How do you expose health-check and metrics endpoints?

**Answer summary:** Expose `/health` (liveness) and `/ready` (readiness) for orchestrators, and `/metrics` in Prometheus format for monitoring.

**Example:**
```js
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics(); // CPU, memory, event loop lag

// Liveness — is the process alive?
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Readiness — can the process handle traffic?
app.get('/ready', async (req, res) => {
  try {
    await db.query('SELECT 1');
    res.json({ status: 'ready' });
  } catch {
    res.status(503).json({ status: 'not ready', reason: 'db unavailable' });
  }
});

// Prometheus metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});
```

---

## Group 9 — Testing

### Q41. How do you write unit tests for Node.js applications?

**Answer summary:** Use Jest (or Node's built-in `node:test` runner). Isolate the unit under test by mocking its dependencies. Keep tests deterministic and side-effect free.

**Example:**
```js
// services/userService.js
export async function getUserById(id, repo) {
  const user = await repo.findById(id);
  if (!user) throw new Error('User not found');
  return user;
}

// services/userService.test.js
import { getUserById } from './userService.js';

describe('getUserById', () => {
  it('returns user when found', async () => {
    const mockRepo = { findById: jest.fn().mockResolvedValue({ id: 1, name: 'Alice' }) };
    const user = await getUserById(1, mockRepo);
    expect(user).toEqual({ id: 1, name: 'Alice' });
  });

  it('throws when user not found', async () => {
    const mockRepo = { findById: jest.fn().mockResolvedValue(null) };
    await expect(getUserById(99, mockRepo)).rejects.toThrow('User not found');
  });
});
```

---

### Q42. What is the difference between unit, integration, and end-to-end tests in Node.js?

**Answer summary:** Unit tests test a single function in isolation with mocks. Integration tests verify multiple modules working together (often with a real DB). E2E tests exercise the full system via HTTP.

| Level | Scope | Speed | Mocking | Confidence |
|-------|-------|-------|---------|------------|
| Unit | Single function/class | ms | Heavy | Logic correctness |
| Integration | Service + DB/queue | seconds | Minimal | Module interactions |
| E2E | Full HTTP request cycle | seconds–minutes | None | System behaviour |

**Recommended ratio:** 70% unit / 20% integration / 10% E2E (testing pyramid).

**Interview takeaway:** Integration tests with a real (but ephemeral, Docker-based) database give the highest ROI in backend services — they catch query bugs unit tests miss, without the full cost of E2E tests.

---

### Q43. How do you mock modules in Jest?

**Answer summary:** Use `jest.mock('module')` to auto-mock, `jest.spyOn` to spy on methods, or manual mocks in `__mocks__/`. Reset mocks between tests with `jest.resetAllMocks()`.

**Example:**
```js
import { sendEmail } from '../services/email.js';

jest.mock('../services/email.js', () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
}));

afterEach(() => jest.resetAllMocks());

it('sends a welcome email on registration', async () => {
  await registerUser({ email: 'alice@example.com', name: 'Alice' });
  expect(sendEmail).toHaveBeenCalledWith({
    to: 'alice@example.com',
    subject: 'Welcome!',
    template: 'welcome',
  });
});
```

**Common pitfall:** `jest.mock` is hoisted to the top of the file by Babel/Jest transforms — the factory function cannot reference variables declared in the test file above it.

---

### Q44. How do you test asynchronous code in Node.js?

**Answer summary:** Return a promise from the test, use `async/await`, or use Jest's `done` callback (avoid `done` for new code). Use `jest.useFakeTimers()` for timer-dependent code.

**Example:**
```js
// async/await (preferred)
it('fetches user data', async () => {
  const user = await userService.findById(1);
  expect(user.name).toBe('Alice');
});

// Testing code with timers
it('retries after 1 second', async () => {
  jest.useFakeTimers();
  const fetchMock = jest.fn()
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue({ id: 1 });

  const promise = fetchWithRetry(fetchMock);
  jest.advanceTimersByTime(1000);

  const result = await promise;
  expect(fetchMock).toHaveBeenCalledTimes(2);
  jest.useRealTimers();
});
```

---

### Q45. What is supertest and how is it used to test Express routes?

**Answer summary:** `supertest` makes HTTP requests directly against an Express `app` instance without binding a real port — enabling fast, self-contained integration tests.

**Example:**
```js
// app.js — note: no app.listen()
import express from 'express';
export const app = express();
app.use(express.json());
app.get('/users/:id', getUser);

// users.test.js
import request from 'supertest';
import { app } from '../app.js';

describe('GET /users/:id', () => {
  it('returns 200 with user data', async () => {
    const res = await request(app).get('/users/1').expect(200);
    expect(res.body).toMatchObject({ id: 1 });
  });

  it('returns 404 for unknown user', async () => {
    await request(app).get('/users/9999').expect(404);
  });
});
```

**Interview takeaway:** Keeping `app.listen()` in a separate `server.js` file is the key pattern that makes supertest work cleanly — the app itself never binds a port in test runs.

---

## Group 10 — Security

### Q46. What are the most common Node.js security vulnerabilities?

**Answer summary:** Injection (SQL, command, NoSQL), prototype pollution, ReDoS, insecure deserialization, path traversal, dependency vulnerabilities, and misconfigured CORS/headers.

**Top vulnerabilities and mitigations:**

| Vulnerability | Mitigation |
|--------------|-----------|
| SQL Injection | Parameterised queries / ORM |
| Command Injection | `execFile`/`spawn` (no shell), sanitise input |
| Prototype Pollution | `Object.create(null)`, `--frozen-intrinsics`, input validation |
| ReDoS | Avoid complex regexes on user input; use `safe-regex` lint rule |
| Path Traversal | Resolve and validate paths with `path.resolve` + prefix check |
| Dependency CVEs | `npm audit`, Dependabot, Snyk |
| SSRF | Whitelist outbound destinations; block private IPs |

---

### Q47. How do you prevent SQL/NoSQL injection in Node.js?

**Answer summary:** For SQL, always use parameterised queries or an ORM. For MongoDB/NoSQL, sanitise and validate input — never interpolate user input into query objects.

**SQL — parameterised query:**
```js
// BAD — SQL injection risk
const user = await db.query(`SELECT * FROM users WHERE email = '${email}'`);

// GOOD — parameterised
const user = await db.query('SELECT * FROM users WHERE email = $1', [email]);

// GOOD — ORM (Prisma example)
const user = await prisma.user.findUnique({ where: { email } });
```

**NoSQL — MongoDB injection:**
```js
// BAD — user controls query operator
const user = await User.findOne({ email: req.body.email }); // email could be { $gt: "" }

// GOOD — validate and type-cast input first
import { z } from 'zod';
const { email } = z.object({ email: z.string().email() }).parse(req.body);
const user = await User.findOne({ email }); // guaranteed to be a plain string
```

---

### Q48. What HTTP security headers should every Node.js API set?

**Answer summary:** `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and removal of `X-Powered-By`.

| Header | Value | Purpose |
|--------|-------|---------|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | Prevent MIME sniffing |
| `X-Frame-Options` | `DENY` | Block clickjacking |
| `Content-Security-Policy` | (varies) | Restrict resource origins |
| `Referrer-Policy` | `no-referrer` | Limit referrer leakage |
| `X-Powered-By` | *(remove)* | Hide server fingerprint |

**Example — manual:**
```js
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  next();
});
```

---

### Q49. How does `helmet` help secure an Express app?

**Answer summary:** `helmet` is a collection of small middleware that sets ~15 security-related HTTP headers in one line. It's the standard first-line security measure for Express apps.

**Example:**
```js
import helmet from 'helmet';

app.use(helmet()); // sensible defaults

// Customise CSP for your app
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", 'cdn.example.com'],
      imgSrc:     ["'self'", 'data:', 'img.example.com'],
    },
  },
  crossOriginEmbedderPolicy: false, // disable if embedding third-party iframes
}));
```

**Headers set by `helmet` include:** CSP, HSTS, X-DNS-Prefetch-Control, X-Download-Options, X-Frame-Options, X-Permitted-Cross-Domain-Policies, X-Content-Type-Options, Origin-Agent-Cluster, Referrer-Policy, X-XSS-Protection (disabled).

**Interview takeaway:** `helmet()` is not a silver bullet — you still need proper auth, input validation, and parameterised queries. It only addresses HTTP header-based attack vectors.

---

### Q50. How do you handle secrets and credentials securely in Node.js?

**Answer summary:** Never hardcode secrets. Use environment variables injected at runtime, a secrets manager (AWS Secrets Manager, HashiCorp Vault, Doppler) in production, and `.env` files (git-ignored) only for local dev.

**Best practices:**
1. `.gitignore` all `.env` files — commit only `.env.example` with dummy values.
2. Rotate secrets regularly; short-lived tokens are better than long-lived API keys.
3. Use `process.env` to read secrets — never import them from code files.
4. Redact secrets from logs using logger redaction (Pino's `redact` option).
5. Scan for leaked secrets in CI with tools like `trufflesecurity/trufflehog` or `gitleaks`.

**Example — fail-fast secret validation:**
```js
const requiredSecrets = ['DATABASE_URL', 'JWT_SECRET', 'STRIPE_SECRET_KEY'];

for (const key of requiredSecrets) {
  if (!process.env[key]) {
    throw new Error(`Missing required secret: ${key}. Check your environment configuration.`);
  }
}
```

**Interview takeaway:** The single biggest secret leak vector is accidental git commits. Use `git-secrets` or a pre-commit hook to scan for patterns like `sk_live_`, `-----BEGIN RSA`, or `AKIA` (AWS keys) before every commit.

---

*End of Node.js Interview Question Bank — 50 Questions*
