# How do you handle uncaught exceptions

## 1. Why This Exists — The Problem First

A `null` reference slips past your validation in a synchronous helper — no try/catch, no promise chain. Node.js emits `uncaughtException`, prints a stack trace, and your entire API process exits. Every in-flight request gets cut off mid-response. The load balancer routes traffic to remaining instances, which buckle under the extra load. Meanwhile, the process manager restarts the crashed worker, but for thirty seconds users saw 502 errors and you have no idea which code path threw because the error wasn't logged before exit.

Uncaught exceptions are errors that escape every handler — thrown synchronously with no surrounding `try/catch`. In Node.js, they are a process-level emergency, not a per-request problem you can brush off.

## 2. The Analogy — Make It Obvious

Your car's engine throws a rod — metal grinding, oil pressure dropping, warning lights everywhere.

You have two bad options:

- **Keep driving** — maybe it'll hold for another mile, but you're risking a seized engine, a fire, and a much bigger repair bill. That's what happens when you catch `uncaughtException` and keep serving requests: the process memory and internal state may already be corrupted.
- **Pull over safely** — turn on hazards, coast to the shoulder, shut off the engine, call a tow truck. That's graceful shutdown: stop accepting new work, finish what's in flight, log what happened, exit, let the process manager restart a clean instance.

The emergency isn't the thrown error itself — it's the unknown damage already done to the engine.

## 3. How It Actually Works — The Full Explanation

When JavaScript throws synchronously and no `try/catch` catches it, Node.js emits `uncaughtException` on the `process` object.

Default behavior (no handler): print stack trace, exit with code 1.

With a handler:

```javascript
process.on('uncaughtException', (err) => { ... });
```

You can log, clean up, and control exit — but Node.js documentation and production experience agree: **the process may be in an undefined state after an uncaught exception**. Modules half-initialized, database transactions mid-flight, in-memory caches inconsistent.

The recommended production pattern:

1. **Log** — structured error with stack trace, request context, process metadata
2. **Report** — send to Sentry, Datadog, or your error tracker
3. **Graceful shutdown** — stop accepting new connections (`server.close()`), wait for in-flight requests to finish (with a timeout), close database pools
4. **Exit with code 1** — non-zero exit tells PM2, systemd, or Kubernetes to restart
5. **Let the process manager restart** — a fresh process with clean state

What graceful shutdown looks like step by step:

- Set a `shuttingDown` flag — health check returns 503 so load balancer stops sending new traffic
- Call `server.close()` — stops accepting new TCP connections
- Wait for active requests to complete (track with a counter or `server.close()` callback)
- Close database/redis connections
- `process.exit(1)` after a hard timeout (e.g. 30 seconds) even if cleanup isn't done

**Uncaught exceptions vs other error types:**

| Error type | Scope | Safe to continue? |
|---|---|---|
| Uncaught exception (sync throw) | Process | No — shutdown and restart |
| Unhandled promise rejection | Process (Node 15+) | No — treat like uncaught |
| Express error middleware catch | Single request | Yes — return 500, keep serving |
| try/catch in route handler | Single request | Yes |

Domains (`domain` module) were an earlier attempt at process-level error isolation — deprecated. Modern approach: catch errors at the request boundary (Express middleware, `async` wrapper) so they never become uncaught in the first place.

## 4. Real Code — See It Working

**Production shutdown handler**

```javascript
const http = require('http');

let isShuttingDown = false;
let activeConnections = 0;

const server = http.createServer((req, res) => {
  if (isShuttingDown) {
    res.writeHead(503);
    return res.end('Server shutting down');
  }

  activeConnections++;
  res.on('finish', () => activeConnections--);

  // your route handling...
});

const SHUTDOWN_TIMEOUT_MS = 30_000;

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.error(`Received ${signal}, starting graceful shutdown`);

  server.close(() => {
    console.log('HTTP server closed, no new connections');
  });

  const deadline = setTimeout(() => {
    console.error('Shutdown timeout — forcing exit');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  deadline.unref();

  // Wait for in-flight requests
  while (activeConnections > 0) {
    await new Promise((r) => setTimeout(r, 100));
  }

  await db.pool.end();
  await redis.quit();

  clearTimeout(deadline);
  process.exit(1);
}

process.on('uncaughtException', async (err) => {
  console.error('UNCAUGHT EXCEPTION — shutting down', err);
  // await sentry.flush(2000); // ensure error is sent before exit
  await shutdown('uncaughtException');
});

process.on('SIGTERM', () => shutdown('SIGTERM'));
```

**Preventing uncaught exceptions in async routes**

```javascript
// Without this wrapper, thrown errors in async handlers become unhandled rejections
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

app.get('/api/users/:id', asyncHandler(async (req, res) => {
  const user = await db.users.findById(req.params.id);
  if (!user) throw new NotFoundError('User not found'); // caught by Express error middleware
  res.json(user);
}));

app.use((err, req, res, next) => {
  logger.error({ err, path: req.path });
  res.status(err.status || 500).json({ error: 'Internal Server Error' });
});
```

**Kubernetes-friendly health check during shutdown**

```javascript
app.get('/health', (req, res) => {
  if (isShuttingDown) return res.status(503).json({ status: 'shutting_down' });
  res.json({ status: 'ok' });
});
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you handle uncaught exceptions in Node.js?**

Listen on `process.on('uncaughtException')`, log the error with full context, perform graceful shutdown (close server, drain in-flight requests, close DB connections), exit with code 1, and let the process manager restart a clean process. Do not continue serving requests after an uncaught exception.

**Q: Why shouldn't you keep running after an uncaught exception?**

The Node.js process may be in an undefined state — partial module initialization, corrupted in-memory data structures, half-completed transactions. Continuing risks serving wrong data or cascading failures that are harder to debug than a clean restart.

**Q: What's the difference between uncaught exceptions and Express error middleware?**

Express error middleware catches errors passed to `next(err)` or thrown in properly wrapped async handlers — scoped to one request. Uncaught exceptions escape all handlers and threaten the entire process. Goal: ensure route-level errors never become uncaught.

**Q: What exit code should you use?**

Exit code 1 (or any non-zero). Process managers and Kubernetes use non-zero exit codes to detect failure and trigger restart. Exit 0 signals success — the manager may not restart.

**Q: How do you ensure automatic recovery?**

Run behind a process manager (PM2 with `autorestart`, systemd `Restart=always`, Kubernetes `restartPolicy: Always`). The manager detects exit code 1 and starts a fresh process. Combine with load balancer health checks so traffic routes away during restart.

**Q: How does this affect frontend clients?**

A crashed process drops in-flight requests — users see 500s or connection resets. Graceful shutdown minimizes blast radius: health check returns 503, load balancer stops routing new traffic, in-flight requests complete. Brief disruption, then automatic recovery.

## 6. The Traps — What Goes Wrong

**Catching and continuing.**

```javascript
process.on('uncaughtException', (err) => {
  console.error(err);
  // BAD: keep serving — state may be corrupted
});
```

This was common in older Node.js codebases. Modern practice: log and exit.

**Async cleanup that never finishes.**

```javascript
process.on('uncaughtException', async (err) => {
  await db.disconnect(); // if this hangs...
  process.exit(1);        // ...this never runs
});
```

Always set a hard timeout that calls `process.exit(1)` regardless.

**No process manager.** Catching the exception and exiting is correct — but without PM2/K8s/systemd, the process stays dead until someone manually restarts it.

**Calling `process.exit()` inside request handlers for errors.** Return a 500 via error middleware instead. Reserve `process.exit` for process-level emergencies.

**Duplicate handler invocations.** Multiple uncaught exceptions in quick succession can fire the handler multiple times. Guard with an `isShuttingDown` flag.

**Forgetting to close the server before exit.** `process.exit()` immediately terminates — in-flight HTTP responses are cut off mid-stream. Call `server.close()` first and wait.

## 7. Compare With Related Concepts

**Uncaught exceptions vs unhandled promise rejections.** Sync throw with no catch vs rejected promise with no `.catch()`. Since Node.js 15, both terminate the process by default. Handle rejections at the source; use `unhandledRejection` handler as a safety net alongside `uncaughtException`.

**Uncaught exceptions vs SIGTERM.** SIGTERM is a polite shutdown signal from the OS/orchestrator (deploy, scale-down). Uncaught exception is an error emergency. Both should trigger graceful shutdown, but SIGTERM is expected; uncaught exception indicates a bug.

**Process-level vs request-level error handling.** Request-level (try/catch, Express middleware) keeps the server running for one bad request. Process-level (uncaughtException) means something fundamental broke — restart the process.

**PM2 auto-restart vs graceful shutdown.** PM2 restarts after exit — it doesn't replace graceful shutdown. You still need `server.close()` to protect in-flight requests before exit.

## 8. 🧠 The Memory Hook — What Sticks

An uncaught exception means the engine threw a rod — you don't keep driving. Log it, pull over safely (graceful shutdown), kill the process, let the manager start a fresh one. The real win is preventing errors from ever becoming uncaught with proper route-level handling.
