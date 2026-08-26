# How do you deploy Express app

## 1. The Real-World Problem — When You Actually Hit This

You finish the Express API. It works perfectly on your laptop. You SSH into a small server, run `node server.js`, close your laptop, and call it deployed. At 2:13 AM your phone buzzes. The app crashed — one unhandled promise rejection from a database timeout — and because you started it by hand, it stayed down. No one restarted it. Customers see a hanging request until the browser times out. You restart it, it works for an hour, then the same thing happens.

When you finally add a process manager, you notice the server has four CPU cores but your app only uses one. Under load, that one core hits 100% while three cores sit idle. Requests queue, latency spikes, and you are paying for hardware you are not using.

Then the weirder bugs start. In development you got the client IP from `req.ip` and rate limited by it. In production behind Nginx every IP looks like `127.0.0.1`, so one abusive client never gets limited and everyone else shares the same bucket. A deploy mid-day kills in-flight checkout requests — the process got a shutdown signal and was killed mid-response, so the frontend got a truncated JSON body and showed a blank error. Health checks return 200 even when the database is down, so the load balancer keeps sending traffic to a dead instance. Env vars were in a `.env` file you copied by hand, and last week someone committed it, rotating every secret after.

None of this is an Express bug. Express does not know how to stay alive, use extra cores, read your secrets safely, speak HTTPS, drain connections, or tell a load balancer whether it is ready. Deployment is everything you add around Express so the app stays up, stays honest, and stays deployable without dropping users.

## 2. The Analogy — Make the Mechanic Obvious

Imagine a touring theater company.

The play itself is your Express app — the script, the cast, the cues. Writing a great play does not mean it can run eight shows a week in a new city without a crew. That crew is deployment.

The stage manager is PM2. The actors do not manage themselves. If an actor faints mid-scene, the show does not wait for someone to SSH in and shout "resume." The stage manager immediately pulls the understudy and restarts the scene. If the whole cast collapses, the stage manager calls everyone back and starts again. That is auto-restart and process supervision. The stage manager also keeps a prompt book — `ecosystem.config.js` — that says how many casts, what props go where, and what to do on opening night versus rehearsal.

Cluster mode is running the same play on four identical stages inside the same building, sharing one box office line. The audience queues once at the front door, and an usher hands each person to the stage with the shortest line. One Node process only ever occupies one stage, even if the building has four. Cluster mode opens the same play on every stage so you actually use the building.

The front-of-house team is the reverse proxy — Nginx or the cloud load balancer. Guests never walk straight onto the stage. They come through the lobby. The lobby team checks tickets at the door (TLS termination), handles coats for free so the actors do not have to (serving static files and compression), and writes the guest's real name on a card before passing them backstage (setting `X-Forwarded-For` and `X-Real-IP`). The actors read the card to know who really arrived. If the stage crew does not trust the lobby's cards — `trust proxy` is off — they think every guest is the lobby itself.

The sealed prop trunk is env config. Each city gets a different trunk — same play, different keys, different database addresses. The stage manager opens the trunk before curtain and inventories it. If the crown is missing, the show does not start with a cardboard replacement and hope for the best. It refuses to open. That is fail-fast validation that fails closed.

The mic check before letting the next audience in is the health check. Between shows, the lobby asks backstage, "Can you take an audience right now?" A quick "yes, lights work" is liveness — is the process alive? A deeper "yes, and all props and the orchestra are ready" is readiness — can you handle real traffic? If the answer is no, the lobby routes the line to another stage.

The curtain call is graceful shutdown. When the theater needs to close a stage for a new set, it does not drop the curtain mid-sentence and shove people out. It stops admitting new guests, lets the current scene finish, bows, turns off the lights, and then strikes the set. That is handling SIGTERM: stop accepting new connections, finish in-flight requests, close database pools, then exit.

Keep this picture. Every deployment piece maps to one crew job.

## 3. The Full Explanation — How It Actually Works

Deployment is not one step. It is a chain, and each link fixes a specific failure you just saw in the pain story.

Start with the build. If your code is plain JavaScript, building is just installing production dependencies with `npm ci --omit=dev`. If it is TypeScript, you compile with `tsc` to JavaScript before the server ever starts. You never run `ts-node` in production — compiling at startup is slower, uses more memory, and exposes dev tooling. Set `NODE_ENV=production` — Express itself checks this to cache view templates, EJS and others skip recompiling on every render, and many libraries reduce debug work when it is set. It is not magic, just a contract that tells every layer "we are in the real theater now, not rehearsal."

Next, the process has to stay alive without a human. Node is a single process. If it throws an uncaught exception or an unhandled rejection and you started it with `node server.js`, it exits and stays dead. A process manager watches it and restarts it. PM2 is the most common one for non-container setups. It does three jobs. First, restart on crash with backoff so a tight crash loop does not hammer the machine. Second, keep stdout and stderr aggregated with rotation so disks do not fill. Third, run cluster mode.

Cluster mode needs a plain-English note because it confuses people. Node runs your JavaScript on one thread on one core, even on a four-core machine. The `cluster` module — which PM2 wraps — forks one master and N workers, each a full Node process with its own event loop and memory, all sharing the same server port. The OS distributes connections. This is not multithreading inside one process. It is multiple copies of your app. It helps only for CPU-bound or concurrent-request pressure. If your bottleneck is a slow database, eight workers still wait on the same database. Memory scales linearly too — four workers use roughly four times the heap. That is the tradeoff you name in an interview.

Env config is where teams quietly create security incidents. The rule is simple. Never commit secrets. Never copy a `.env` by hand onto servers. Use the platform's secret store and expose values as environment variables the process reads through `process.env`. Validate them once, at startup, before listening. If a required key is missing or malformed, throw and crash immediately. Crashing before accepting traffic is far safer than starting half-configured and writing to the wrong database. Security-bound lookups must fail closed — if you cannot confirm a value is valid, treat it as missing. Do not fall back to a hard-coded dev secret in production. For rotation, support reading the new secret location without code changes — for example, prefer `DATABASE_URL` over a baked-in host, so rotation is a platform update and a rolling restart, not a code deploy.

The reverse proxy sits in front of Express and fixes three things Express should not do. First, TLS. Terminating HTTPS inside Node works but is slower and forces you to manage certificates in app code. Let Nginx, Caddy, or the cloud load balancer terminate TLS and forward plain HTTP to Express over localhost or a private network. Second, static files and compression. Nginx serves `public/` from disk with kernel sendfile and compresses responses very efficiently. Letting Node read files and gzip them wastes event-loop time. Third, headers and client identity. When a proxy forwards, the TCP connection Express sees comes from the proxy, not the user. The proxy adds `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Real-IP`. Express ignores them by default. You explicitly opt in with `app.set('trust proxy', 1)` or `true`. If you forget, `req.ip` is the proxy, `req.protocol` is `http` even on HTTPS, cookies marked `secure` may misbehave, and any IP rate limiter becomes useless. Trust only the number of hops you control — `1` behind one proxy, not blind trust.

Graceful shutdown is the piece most take-homes skip and seniors always mention. When you deploy, the orchestrator does not kill the old process instantly. It sends `SIGTERM`. You have a window — often 30 seconds on platforms — to stop taking new work, finish what you have, and exit cleanly. The app should, on `SIGTERM`, stop the HTTP server from accepting new connections, wait for in-flight requests to finish with a timeout, close the database pool, and then exit. Without this, a rolling deploy slices through active checkout requests. The client sees a reset connection, the database sees an abandoned transaction, and retries create duplicates. Also handle `unhandledRejection` and `uncaughtException` at the process level — log and begin shutdown, do not try to send an HTTP response there because there is no `res`.

Health checks are how orchestrators decide whether to send traffic and whether to restart you. Use two endpoints, not one. `GET /health/live` (liveness) returns 200 if the process is running — cheap, no dependencies. `GET /health/ready` (readiness) returns 200 only if dependencies the request path needs are reachable — typically a lightweight database ping. Keep readiness light. A deep check that lists tables or hits every downstream service turns a downstream blip into a self-inflicted outage as every instance fails readiness at once. If readiness fails, the load balancer drains the instance. If liveness fails, the orchestrator restarts it. This split is what makes zero-downtime deploys possible.

Zero-downtime is the combination of the previous two. PM2 does `pm2 reload` by restarting workers one by one, waiting for each new worker to be ready before stopping the next old one. Containers do rolling updates the same way — Kubernetes replaces pods one at a time and only routes to a new pod after its readiness probe passes. In both cases the migrator rule is: make database changes backward-compatible first, deploy code that works with both old and new schemas, then clean up the old schema. Deploying a breaking column rename without this breaks the old instances still serving traffic.

Put it together and the chain is: build, validate env, start with a process manager in cluster, sit behind a proxy that terminates TLS and forwards real IPs, expose live and ready probes, and shut down by draining first. That chain, not any single tool, is what "deploying Express" means.

For request-level reliability inside that deployed process — how errors are caught and logged once they reach Express — see [how Express middleware walks the stack](./how-does-express-middleware-work.md) and [global error handling](./how-do-you-implement-global-error-handling.md). For log shaping and correlation once the deployment is up, see [how do you handle logs](./how-do-you-handle-logs.md). This page owns the outside — the crew around Express — and links to those pages instead of re-teaching their internals.

## 4. See It In Practice — Real Code or Queries

The snippets below assume Node 18+, Express 4, and PM2 installed globally for non-container hosts. Handlers that await IO are wrapped with a tiny `ah` helper — in Express 4 a rejected promise without it never reaches error middleware. On Express 5 you can drop the wrapper and Express will route rejections itself. Security-related lookups fail closed.

**Ecosystem file — the prompt book PM2 reads**

This is the only place instance count and env live for a PM2 host. No container orchestrator is present here; where Kubernetes or ECS is used, that layer replaces PM2.

```js
// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'api',
      script: './server.js',
      // use all cores on this host; on a 2-core staging box use 2 instead of max
      instances: 'max',
      exec_mode: 'cluster',
      // PM2 will send SIGTERM and wait this long before SIGKILL
      kill_timeout: 30000,
      // wait until the app says it is listening before considering it online
      wait_ready: true,
      // do not merge logs blindly across workers
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

```bash
# one-time on the host
# pm2 start ecosystem.config.js --env production
# pm2 save
# pm2 startup   # prints the systemd unit to run on reboot — run what it says
# zero-downtime reload after a new build
# pm2 reload ecosystem.config.js --update-env
```

**Env validation — inventory the trunk before curtain**

This runs before `app.listen` and crashes fast with a clear message if anything required is missing. Add new required keys to the list — anything unknown is ignored, anything required and missing blocks boot.

```js
// config/env.js
function requireEnv(name) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    // fail loud and early — do not guess a dev fallback in production
    throw new Error('Missing required env var: ' + name);
  }
  return value;
}

function loadConfig() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const isProd = nodeEnv === 'production';

  const config = {
    nodeEnv: nodeEnv,
    port: Number(process.env.PORT || 3000),
    databaseUrl: requireEnv('DATABASE_URL'),
    // optional value with a safe default — only for non-secret config
    logLevel: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  };

  if (!Number.isFinite(config.port) || config.port <= 0) {
    throw new Error('PORT must be a positive number');
  }

  return config;
}

module.exports = { loadConfig };
```

**App — trust proxy, health probes, graceful drain**

Note the order: trust proxy and json parsing first, liveness before heavy middleware so it stays cheap, readiness does a real but lightweight dependency ping and fails closed.

```js
// server.js
const express = require('express');
const { loadConfig } = require('./config/env');

// validate before anything listens
const config = loadConfig();

const app = express();

// behind one Nginx or one load balancer hop — trust exactly one
app.set('trust proxy', 1);

app.use(express.json());

// tiny helper so Express 4 forwards async rejections to error middleware
const ah = function (fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// liveness — cheap, no IO. answers "is the process up"
app.get('/health/live', function (req, res) {
  res.json({ status: 'ok' });
});

// readiness — light dependency check. answers "can you take real traffic"
app.get(
  '/health/ready',
  ah(async function (req, res) {
    // replace with a real ping — e.g. SELECT 1 or redis PING
    const ok = await pingDatabase();
    if (!ok) {
      // fail closed — a broken dependency is not "ready"
      return res.status(503).json({ status: 'not_ready', reason: 'db_unreachable' });
    }
    res.json({ status: 'ready' });
  })
);

app.get('/api/users/:id', ah(async function (req, res) {
  const user = await findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ data: user });
}));

// global error handler must be last — four params so Express recognizes it
// eslint-disable-next-line no-unused-vars
app.use(function globalErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  console.error({ message: err.message, stack: err.stack, url: req.originalUrl });
  const isProd = config.nodeEnv === 'production';
  const body = { error: isProd ? 'Internal server error' : err.message };
  res.status(err.statusCode || 500).json(body);
});

const server = app.listen(config.port, function () {
  console.log('listening on ' + config.port);
  // tells PM2 wait_ready that this worker is accepting connections
  if (process.send) process.send('ready');
});

// graceful shutdown — curtain call, not a blackout
let shuttingDown = false;

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('received ' + signal + ', draining');

  // stop accepting new connections
  server.close(function () {
    console.log('http server closed, closing dependencies');
    closeDatabasePool()
      .then(function () {
        console.log('pool closed, exiting');
        process.exit(0);
      })
      .catch(function (err) {
        console.error('error closing pool', err);
        process.exit(1);
      });
  });

  // safety valve — force exit if drain takes too long
  setTimeout(function () {
    console.error('graceful shutdown timed out, forcing exit');
    process.exit(1);
  }, 25000).unref();
}

process.on('SIGTERM', function () { shutdown('SIGTERM'); });
process.on('SIGINT', function () { shutdown('SIGINT'); });

// placeholder implementations — replace with your real data layer
async function pingDatabase() {
  return true;
}
async function findUserById(id) {
  return null;
}
async function closeDatabasePool() {
  return;
}
```

**Reverse proxy — Nginx forwards and marks the real guest**

Nginx terminates TLS, serves static files, compresses, and adds the forwarding headers Express reads via `trust proxy`. The `proxy_read_timeout` should exceed your longest normal request plus drain window.

```nginx
# /etc/nginx/sites-available/api.example.com
server {
  listen 80;
  server_name api.example.com;
  # redirect all http to https — certs from certbot/ACME
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl http2;
  server_name api.example.com;

  ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

  # static files never hit Node
  location /static/ {
    root /var/www/api/public;
    expires 1y;
    add_header Cache-Control "public, immutable";
  }

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
    proxy_read_timeout 30s;
  }
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you deploy an Express application?**

I build the app for production, validate env at startup, keep it alive with a process manager behind a reverse proxy, and ship through CI/CD with health checks and graceful shutdown. Concretely: compile TypeScript if present, `npm ci --omit=dev`, set `NODE_ENV=production`, and start with PM2 in cluster mode from an `ecosystem.config.js` on bare hosts, or as a container where the orchestrator owns restarts. The platform injects env vars — never a `.env` file — and the app validates them before listening. Nginx or the cloud load balancer terminates TLS, serves static files, compresses, and proxies to Express on localhost with `X-Forwarded-For` headers, so Express sets `trust proxy` to read the real client IP. The app exposes `/health/live` and `/health/ready`, handles `SIGTERM` by draining, and CI runs tests then does a rolling deploy with backward-compatible migrations.

**Q: What is PM2 and why use it in production?**

PM2 is a Node process manager for hosts that are not running containers under an orchestrator. It restarts the app if it crashes, aggregates and rotates logs, and runs a cluster of workers across cores. The key command is `pm2 start ecosystem.config.js --env production` with `exec_mode: cluster` and `instances: max`. For zero downtime it does `pm2 reload`, which replaces workers one at a time and waits for each new worker to signal ready before stopping the next old one. On Kubernetes or ECS the orchestrator handles restarts and rolling updates, so PM2 is not used inside those containers — running two supervisors creates duplicate restart logic and hides the real process signal.

**Q: What does cluster mode do and when does it not help?**

Node runs your code on one thread. On a four-core server one process still uses one core. Cluster forks one master and N workers — each a full Node process with its own heap and event loop — all sharing the same port, with the kernel or master distributing connections. It increases concurrent request capacity and isolates a single-worker crash so other workers keep serving. It does not speed up a single slow request, does not share memory between workers, and does not fix a database that is the real bottleneck. It also multiplies memory, so size your host accordingly and do not blindly set `instances: max` on a memory-tight box.

**Q: How should environment variables be managed in production?**

Treat them as secrets delivered by the platform, not files you copy. On PaaS set them in the dashboard or CLI, on AWS use Parameter Store or Secrets Manager, on Docker use the secret mechanism, on Kubernetes use ConfigMaps for plain config and Secrets for sensitive values, and in CI store them as the provider's encrypted secrets. Read them via `process.env` and validate eagerly at boot with no prod fallback — if `DATABASE_URL` is missing, throw and crash before `listen`. Rotate by updating the platform value and triggering a rolling restart; support rotation gracefully where the secret is a signing key by briefly accepting both old and new values. Never commit `.env`, never log `req.body` or `req.headers` wholesale, and never return an env value in an error response.

**Q: How do you set up a reverse proxy for Express and why does `trust proxy` matter?**

Put Nginx or the cloud load balancer in front. It terminates TLS, serves `/static` directly, compresses, and proxies API paths to `http://127.0.0.1:3000` with `Host`, `X-Real-IP`, `X-Forwarded-For`, and `X-Forwarded-Proto`. Express by default ignores those headers because accepting them from anyone would let a client spoof its IP. `app.set('trust proxy', 1)` tells Express to trust one hop — your known proxy — and then `req.ip`, `req.ips`, and `req.protocol` reflect the real client. Without it rate limiting by IP, secure cookie handling, and audit logs all see the proxy. Set the hop count to the number of trusted proxies in front, not `true` on the open internet.

**Q: How do you implement graceful shutdown?**

Listen for `SIGTERM` (and `SIGINT` for local Ctrl-C). On signal, mark the process as shutting down, call `server.close()` so the HTTP server stops accepting new connections, wait for in-flight requests to finish, close database and queue connections, then `process.exit(0)`. Add a timeout — for example 25 seconds on a 30-second platform window — that forces exit if something hangs, so the orchestrator does not have to `SIGKILL` you. The readiness probe should start returning 503 as soon as shutdown begins so the load balancer stops sending new traffic while you drain.

**Q: What are health checks and how do liveness and readiness differ?**

Liveness asks "is this process alive?" — a handler that returns 200 with no IO. If it fails, restart the instance. Readiness asks "is this instance ready to serve real users right now?" — a handler that pings essential dependencies with a single lightweight query like `SELECT 1` and returns 200 only on success, otherwise 503. Keep readiness shallow. Checking every downstream service deeply means one dependency blip makes every instance unready at once. Classify carefully: a failing payment provider may be a reason to stay ready and degrade, while a down primary database is a reason to be not ready.

**Q: How do you achieve zero-downtime deployments?**

Drain, probe, and migrate compatibly. First, make the new code work with both the old and new database schemas — add columns nullable, support both shapes, never rename or drop before callers stop needing it. Then roll workers one by one. PM2's `reload` does this by starting new workers, waiting for each to be ready, then stopping old ones. Kubernetes does rolling updates with readiness probes. New instances only get traffic after readiness passes. In-flight requests on old instances finish during the graceful shutdown window instead of being cut.

## 6. The Traps — What Goes Wrong in Production

Running with `node server.js` in production. It works in demos and dies at night. One crash leaves the service down until a human intervenes, and a deploy requires manual stop and start, so every deploy is downtime. Fix: `pm2 start` with `ecosystem.config.js` on bare hosts, or a container with a proper restart policy and rolling update, plus `pm2 startup` so restarts survive a host reboot.

Using one process on a multi-core host. A four-core server running a single Node instance caps you at one core. Latency climbs while CPU on three cores sits at idle. Fix: `instances: max` and `exec_mode: cluster` in PM2, or scale containers horizontally. Measure whether you are CPU-bound first — if you are IO-bound on the database, extra workers add memory pressure without throughput.

Running PM2 inside a container. Containers already have a supervisor — Docker restart policy, ECS, or Kubernetes. A second supervisor inside catches `SIGTERM` incorrectly, doubles restarts, and hides the real exit code from the orchestrator. Fix: on orchestrated platforms, run `node server.js` directly as PID 1 or through a tiny init that forwards signals, and let the platform handle health and restarts.

Forgetting `trust proxy`. Every `req.ip` is the proxy, so rate limiting groups all users into one bucket, one attacker never gets throttled, and logs point everyone at `127.0.0.1`. Fix: `app.set('trust proxy', 1)` behind one proxy, and `X-Forwarded-For` handling only from trusted hops.

Proxying without draining. The load balancer stops routing but the process gets `SIGKILL` immediately and severs half-written responses. Clients see truncated JSON and retries may double-charge. Fix: `server.close()` on `SIGTERM`, finish in-flight requests, set a drain timeout, and have readiness return 503 during shutdown so new traffic stops arriving.

Health checks that are too deep or too honest about internal details. A readiness probe that hits every microservice turns one downstream latency spike into a full fleet outage as every instance goes unready. Returning database error messages or env values in the health body leaks internals. Fix: readiness pings only the dependencies that must be up to serve the request path, and returns `{ status: 'not_ready' }` with a 503 and no stack or config.

Committing or logging secrets. `.env` in git means every clone, every fork history, and every CI cache contains last quarter's database password. Logging `req.headers` or `req.body` dumps Authorization headers into a bucket the whole team reads. Fix: `.env` in `.gitignore` always, platform secret stores in prod, and startup validation that fails closed — missing secret means crash, not fallback to a hard-coded string.

Making a breaking database migration right before deploy. You rename a column, new code expects the new name, old instances still reading the old name crash on every request during the rolling window. Fix: expand then contract — add the new column nullable, deploy code that writes both and reads either, backfill, then remove the old column in a later deploy.

## 7. Compare With Related Concepts

**PM2 versus systemd versus Docker restart policy versus Kubernetes.** All four restart a crashed process, but they sit at different layers. `systemd` restarts a host service and runs it on boot. PM2 does the same plus Node-aware cluster forking and log handling on bare hosts. Docker's restart policy restarts a container. Kubernetes adds health probes, rolling updates, and bin packing across hosts. Rule: on a bare VM use PM2 or systemd, not both supervising the same node process. In containers let the orchestrator own the lifecycle and do not run PM2 inside.

**PM2 cluster versus Node `cluster` module versus `worker_threads`.** The Node `cluster` module is the primitive — manual master/worker forking. PM2 is the operator around it — config file, reload strategy, log rotation, startup scripts. `worker_threads` is different — threads inside one process sharing memory, meant for CPU-heavy work like image processing or parsing. Workers cannot isolate a crash the way cluster processes can, and they share the same port differently. Rule: use PM2 cluster (or multiple containers) for request concurrency, use worker threads for offloading hot CPU work inside a single container.

**Reverse proxy versus exposing Express directly.** Exposing Node directly forces Node to handle TLS handshakes, static files, and slow clients, all of which tie up the event loop. A proxy does those in purpose-built native code and keeps slow-client buffering off Node. Rule: Node handles application logic. The proxy handles the edge — TLS, static, compression, and buffering.

**Liveness versus readiness.** Liveness says "am I alive?" Readiness says "should I get traffic?" Conflating them causes two failure modes. If readiness logic is inside liveness, a brief downstream blip restarts every instance instead of just draining them. If liveness is too lazy and never fails, a deadlocked process stays in rotation. Rule: liveness cheap with no IO, readiness with one light IO to the dependency you cannot serve without.

**Graceful shutdown versus force kill.** `SIGTERM` is the polite request, `SIGKILL` is the forced stop. The gap between them is your drain budget. Setting the app drain longer than the platform's kill timeout guarantees truncated requests. Rule: keep app drain a few seconds shorter than the platform's termination grace period so you always exit before the force kill.

**Env files versus platform secret injection.** `.env` is a developer convenience — a single file for local defaults, never committed, never copied to prod. Platform injection is the production contract — audited, rotated without code changes, scoped per environment. Rule: `.env` for local, secret manager plus validation for every real environment.

## 8. 🧠 The Memory Hook

Deployment is not launching the play. It is the crew that keeps it running eight shows a week — the stage manager who restarts a fainted actor, four identical stages sharing one box office, a lobby that checks tickets and writes the real guest name on the card, sealed trunks inventoried before curtain, a mic check before seating the next audience, and a curtain call that lets the current scene finish before the lights go out.
