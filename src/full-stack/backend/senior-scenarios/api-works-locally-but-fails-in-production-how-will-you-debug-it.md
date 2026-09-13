# API works locally but fails in production — How will you debug it

## 1. The Real-World Problem — When You Actually Hit This

It works on your laptop. `curl localhost:3000/api/orders` returns 200. The frontend is happy. You push to main, CI is green, it deploys, and production returns 500. Or it returns a CORS error in the browser console. Or it hangs for 30 seconds and then times out. Same code, same request, completely different result.

This is the classic "works on my machine" failure and it is almost never about the code logic. The logic is fine. What changed is the world around the code. On your laptop the database is on localhost with no password, the frontend and backend are both on localhost so CORS never triggers, your `.env` file has every secret, you are on Node 20, and you are running `npm run dev` which reads your source files directly. In production the database lives behind a VPC, secrets come from a manager not a file, the frontend is on `https://app.example.com` and the API is on `https://api.example.com`, TLS is required, an Nginx or load balancer sits in front, and the running code is a built artifact from last week's build step, not your current source.

CI is green because CI also does not run in production. Tests mock the database, skip the real secrets manager, and never hit the real reverse proxy. So CI passing tells you the code is syntactically correct, not that it can actually reach the database or be called from the browser in production.

When an interviewer asks this, they are not asking you to list random tools. They want to know if you can close the gap between two environments methodically without guessing, without restarting production blindly, and without leaking secrets into logs.

## 2. The Analogy — Make the Mechanic Obvious

Think of your API as a chef who cooks perfectly at home but fails on day one in a restaurant kitchen.

At home, every ingredient is on the counter, the oven is the one you know, the recipe card is taped to the wall, and there is no waiter between you and the person eating. You cook, you hand the plate over.

The restaurant has the same chef and same recipe, but everything around the chef is different. Ingredients are locked in a pantry and you need a key from the manager — that is env vars and secrets manager. The dining room and kitchen are in different buildings and the door has a bouncer who checks IDs — that is CORS and TLS. The water comes through different pipes with a valve that only opens from inside the building — that is the database connection and VPC allowlist. The recipe has a new step added last week but no one reprinted the card in the kitchen — that is migrations not run. The restaurant oven is an older model that burns hotter — that is the Node version. The food you serve is not what you just cooked but what was pre-packed hours ago during prep — that is the build artifact. And the waiter who is supposed to carry orders to the kitchen keeps sending them to the wrong table — that is the reverse proxy.

The chef did not forget how to cook. The kitchen around the chef changed. Debugging prod-only failures is walking that restaurant kitchen and checking each of those surroundings one by one, with evidence, not guesswork.

## 3. The Full Explanation — How It Actually Works

Local and production are two different computers pretending to run the same app. They share the code, they do not share the environment. Every prod-only failure is a parity gap — something your laptop gives you for free that production does not.

Here are the gaps that break APIs most often, and a workflow that finds which one is biting you.

The most common parity gaps:

Env vars and secrets look invisible until they are missing. On your laptop you have a `.env` file with `DATABASE_URL`, `JWT_SECRET`, `STRIPE_KEY`. That file is in `.gitignore` so it never deploys. In production the app reads from `process.env` but the variable was never set in the container, in the hosting dashboard, or in the secrets manager. The app then starts with `undefined`, connects to the wrong place, or crashes on first request. A missing env var often shows up as `ECONNREFUSED`, `undefined is not a string`, or a 500 with no useful body because the error was thrown before your error handler ran.

Secrets manager is the production version of `.env`. On AWS it is Secrets Manager or Parameter Store, on GCP it is Secret Manager, on Kubernetes it is a Secret mounted as an env var. If the IAM role or service account does not have permission to read the secret, the app gets an access-denied error at boot or gets an empty value. The app may still start, but every request that needs that secret fails. Locally you never hit this because you copied the secret into the file by hand.

CORS only shows up when frontend and backend have different origins. On localhost you often run `localhost:3000` for frontend and `localhost:4000` for backend, and many setups disable CORS locally or use a proxy, so you never notice a missing `Access-Control-Allow-Origin` header. In production the origins are `https://app.example.com` and `https://api.example.com`, the browser enforces CORS, and a missing or too-strict CORS config turns a working API into a browser-only failure — curl works, the browser does not. The error lives in the browser console, not in your backend logs, which confuses people who only check backend logs.

TLS and HTTPS change what the browser and server allow. Locally you use `http`. In production you use `https` with a real certificate. If the certificate is expired, self-signed, or attached to the wrong domain, fetch fails. If your API still redirects to `http` or sets cookies without `Secure` and `SameSite=None`, the browser drops them. Mixed-content errors also appear only in production when a `https` page tries to call an `http` API.

Database connection failures are the number one 500 in prod. Locally you connect to `localhost:5432` with no SSL, no password, and a wide-open network. In production the database is inside a VPC, requires SSL, requires a password from the secrets manager, and only allows connections from certain IPs or security groups. You get `ETIMEDOUT`, `self signed certificate`, or `password authentication failed` even though the query itself is perfect. Connection pooling also behaves differently — your laptop has one user, production has hundreds of concurrent connections, so a pool of 5 connections that was fine locally exhausts in prod.

Migrations not run means your code and your schema disagree. You added a column `orders.status` locally, ran `npm run migrate` on your laptop, and forgot to run it in production as part of deploy. The code sends `INSERT INTO orders (status)` and Postgres returns `column status does not exist`. CI does not catch this because tests run against a fresh test DB that was migrated in the test setup, not against the real prod DB.

Node version differences break native modules and language features. Your laptop is on Node 20, production is on Node 18, and the package `bcrypt` or `sharp` was compiled for 20. It crashes on import. Or you use `Array.fromAsync` which does not exist on 18. The build may succeed because CI uses 20, but the runtime container uses 18.

Build artifacts are what production actually runs. Locally you run source with `tsx` or `nodemon` which reads env vars at request time. In production you run `npm run build` and then `node dist/server.js`. For frontends like Next.js, env vars prefixed with `NEXT_PUBLIC_` are inlined at build time, not at runtime, so changing an env var without rebuilding does nothing. A stale `dist` folder, a cached Docker layer, or a CDN serving last week's bundle means production is not running the code you think it is.

Reverse proxy is the invisible front door. In production Nginx, an Application Load Balancer, Cloudflare, or an API gateway sits in front of your Node process. It handles TLS termination, path rewriting, header forwarding, and timeouts. Common breaks: the proxy forwards `/api/orders` but strips `/api` so your Express route `app.get('/api/orders')` never matches and returns 404. The proxy times out after 30 seconds while your handler needs 45. The proxy does not forward `X-Forwarded-For` or `Authorization` headers, so auth fails. Locally there is no proxy, so you never see this.

How to debug it without guessing:

Start with evidence, not hypotheses. Get the exact error as the user sees it: status code, response body, browser console, and the time it happened. Then pull server evidence for that same time window: application logs, reverse proxy logs, platform logs, and metrics. Look for the request ID or trace ID that ties the frontend error to one backend log line. If you do not have request IDs, add them later, but for now search by time, route, and status code.

Diff the environments. Run `printenv | sort` or check your host dashboard and compare local vs staging vs production. Check Node version with `node -v`, check the build hash or git SHA the server reports on a health endpoint, check which migrations have run with your migration table, and check which secrets are actually loaded by logging their presence not their value. A config endpoint like `GET /health` that returns `{ sha, nodeVersion, dbMigrated: true, envLoaded: ["DATABASE_URL"] }` without exposing values saves hours.

Reproduce via staging, not by poking production. Staging should be as close to production as possible — same proxy, same TLS, same secrets manager path, same VPC rules, same build step. Replay the failing request against staging with the same headers, same origin, and same TLS. If it fails in staging, you can add verbose logging there safely. If it only fails in production, make the read-only checks above and then promote a candidate fix to staging first.

Use observability at three levels. Logs tell you what one request did. Metrics tell you if many requests started failing at deploy time, if CPU or connection pool saturated, or if error rate spiked. Traces tell you which hop failed — frontend to proxy, proxy to app, app to database. A single structured log line per request with method, path, status, duration, request ID, and error code is more useful than ten scattered `console.log` calls.

Once you know the gap, ship the smallest safe fix: set the missing env var, add the CORS origin, run the migration, bump the proxy timeout, rebuild the artifact. Then add the guardrail so it cannot happen again: validate env vars at boot and crash fast if missing, make migrations part of the deploy pipeline not a manual step, pin the Node version in `.nvmrc` and Dockerfile, add a CORS integration test that runs against the built app, and monitor the health endpoint.

## 4. See It In Practice — Real Code or Queries

These are the patterns that separate a local-only app from one that actually survives production.

Fail fast on missing env vars. Never let the app start with `undefined` secrets.

```js
// config.js — validate at boot, not at first request
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url(),
  JWT_SECRET: z.string().min(32),
  CORS_ORIGIN: z.string().url(), // e.g. https://app.example.com
  NODE_ENV: z.enum(["development", "production", "test"]),
  PORT: z.string().default("4000"),
});

export const env = envSchema.parse(process.env);
// If any var is missing or wrong, this throws immediately on startup
// with a clear message like "DATABASE_URL: Required" instead of a
// cryptic 500 during the first user request.

console.log("Booting", {
  sha: process.env.GIT_SHA || "unknown",
  node: process.version, // log Node version so mismatches are obvious
});
```

Do not hardcode localhost. Read origins and URLs from config.

```js
// bad — works locally, fails everywhere else
// const API_URL = "http://localhost:4000";
// fetch(`${API_URL}/api/orders`)

// good — same code in every environment
const API_URL = env.API_URL; // https://api.example.com in prod
fetch(`${API_URL}/api/orders`, { credentials: "include" });
```

Configure CORS for the real origins, handle preflight, and do not use a wildcard when you need credentials.

```js
// server.js — Express
import express from "express";
import cors from "cors";
import { env } from "./config.js";

const app = express();

// Allow only the real frontend origins, not "*"
const allowedOrigins = env.CORS_ORIGIN.split(","); // "https://app.example.com,https://staging.example.com"

app.use(
  cors({
    origin: (origin, cb) => {
      // allow server-to-server calls with no origin (curl, health checks)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true, // needed if you send cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Important: handle OPTIONS before your routes
app.options("*", cors());

app.get("/api/orders", (req, res) => {
  res.json({ ok: true });
});

app.get("/health", (req, res) => {
  // safe to expose — no secret values, only presence and versions
  res.json({
    status: "ok",
    sha: process.env.GIT_SHA || "unknown",
    nodeVersion: process.version,
    uptime: process.uptime(),
  });
});
```

Check that your reverse proxy forwards correctly. A common Nginx break looks like this:

```nginx
# bad — strips /api but Express expects /api/orders -> 404
# location /api/ { proxy_pass http://app:4000/; }

# good — keep the prefix or match your Express routes
location /api/ {
  proxy_pass http://app:4000;  # no trailing slash, keeps /api/orders
  proxy_set_header Host $host;
  proxy_set_header X-Request-Id $request_id;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_read_timeout 60s; # avoid 504 if your handler needs >30s
}
```

Database connections must use the prod URL, SSL, and a real pool. Log pool wait time, not passwords.

```js
// db.js
import pg from "pg";
import { env } from "./config.js";

export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.NODE_ENV === "production" ? { rejectUnauthorized: true } : false,
  max: 20, // local default of 5 exhausts under prod load
  idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
  // this catches idle pool errors that otherwise crash the process silently
  console.error("pg pool error", { message: err.message, code: err.code });
});
```

Migrations must run as part of deploy, not by hand. Compare what has run:

```bash
# in deploy pipeline, after building but before switching traffic
npm run migrate:status   # lists applied vs pending
npm run migrate:deploy   # runs pending migrations, fails deploy if it fails

# quick manual check in staging/prod (read-only)
psql $DATABASE_URL -c "select name, applied_at from migrations order by applied_at desc limit 10;"
```

Build artifacts and secrets manager checks:

```bash
# 1. Is prod running the code you think?
curl -s https://api.example.com/health | jq
# expect: { sha: "a3f9c1...", nodeVersion: "v20.x" }
git rev-parse HEAD  # compare local SHA to health SHA

# 2. Did env vars actually load?
# Do not log secret values — log presence only
node -e "console.log({ hasDb: !!process.env.DATABASE_URL, hasJwt: !!process.env.JWT_SECRET })"

# 3. Does the container have permission to read secrets?
aws secretsmanager get-secret-value --secret-id prod/api/jwt --query SecretString
# if this fails with AccessDenied, your task role is wrong — fix IAM, not code

# 4. Diff env between staging and prod (names only)
diff <(printenv | cut -d= -f1 | sort) <(ssh staging "printenv | cut -d= -f1 | sort")

# 5. Rebuild check — is frontend using build-time env?
# In Next.js, changing NEXT_PUBLIC_API_URL requires a rebuild
npm run build && npm start  # not npm run dev
```

Structured logging and request IDs tie the browser error to one backend line:

```js
import { randomUUID } from "crypto";

app.use((req, res, next) => {
  req.id = req.headers["x-request-id"] || randomUUID();
  res.setHeader("x-request-id", req.id);
  const start = Date.now();
  res.on("finish", () => {
    console.log(
      JSON.stringify({
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: Date.now() - start,
      })
    );
  });
  next();
});
```

When the frontend gets a 500, copy the `x-request-id` from the response headers, search logs for that ID, and you land on the exact stack trace instead of hunting by time.

## 5. Interview Questions — All of Them, Done Properly

**Q: Your API returns 200 locally but 500 in production. Where do you start?**

I do not guess. I get the exact user-facing error with time, route, and response body, then I pull logs for that same time and route. I check the health endpoint to see which SHA and Node version is actually running. I compare env vars between local and production by checking presence not values. I check proxy logs and app logs separately because a 500 from Nginx looks different from a 500 from Node. If I can reproduce the same request with curl against production and it also fails, it is a backend or proxy issue. If curl succeeds but the browser fails, it is likely CORS or TLS or cookie related. That first split saves a lot of time.

**Q: How do you systematically debug a prod-only failure without breaking production further?**

I follow a loop: evidence, diff, reproduce, fix forward. First, read-only evidence — logs, metrics, traces, health endpoint, migration status. Second, diff the environments — Node version, env vars, build SHA, proxy config, database state. Third, reproduce in staging which should mirror production. I add verbose logging only in staging, not in prod. Fourth, ship the smallest safe fix through the normal pipeline. I avoid `console.log` in production, avoid restarting the database, and avoid changing env vars directly on the production box without going through the deploy pipeline, because manual edits drift and get overwritten on next deploy.

**Q: How do you prevent "missing env var" failures forever?**

Validate env vars at boot and crash fast. Use a schema like Zod so the app refuses to start with `DATABASE_URL is required` instead of throwing `cannot read property of undefined` on the first user request ten minutes after deploy. Store secrets in a manager, not in the repo, and grant the production role permission to read them. Log which vars are loaded without logging their values. Add a deploy check that fails the pipeline if a required var is not set. And pin where env vars are documented so a new developer does not have to guess which ones exist.

**Q: The browser shows a CORS error only in production. Curl works. What is happening and how do you fix it?**

CORS is a browser rule, not a server rule, so curl not caring is expected. Locally the frontend calls `localhost:4000` or uses a dev proxy, so the browser never enforces a cross-origin check. In production the frontend is on `https://app.example.com` and the API is on `https://api.example.com`, so the browser sends an OPTIONS preflight and checks `Access-Control-Allow-Origin`. If the server returns no header or returns `*` while the request needs credentials, the browser blocks the response. The fix is to set `origin` to the exact frontend origin, set `credentials: true` on both server and fetch, allow the needed headers, and make sure the proxy forwards OPTIONS and does not strip CORS headers. I also check that the production frontend is actually calling the production API URL and not a leftover `localhost` value that was inlined at build time.

**Q: The API cannot reach the database in production. How do you narrow it down?**

I check layers from outside in. First, is `DATABASE_URL` set and does the app see it at boot, without logging the password. Second, can the container reach the database network — is there a VPC, security group, or IP allowlist blocking it, which shows as `ETIMEDOUT` or `ECONNREFUSED`. Third, does the connection require SSL and is the certificate setup correct, which shows as `self signed certificate` or `no pg_hba.conf entry`. Fourth, are credentials correct — `password authentication failed` means the secret is wrong or stale. Fifth, are migrations applied — `column does not exist` means schema drift. Sixth, is the pool exhausted — check `pg_stat_activity` and pool metrics for waiting clients. Each error message points to a specific layer, so I match the message before changing config.

**Q: Your deploy just went out and the error rate spiked. What do you do right now?**

I reduce impact first, debug second. If I have a blue-green or rolling deploy, I roll back to the previous healthy SHA. That is faster and safer than hotfixing forward under pressure. I check metrics to confirm the spike started at deploy time and correlates with the new SHA, not with an external dependency. I check if the new build introduced a missing env var or a migration that was not run. After rollback, I reproduce the failure in staging with the same SHA and fix there. Every deploy should have an easy rollback and a health check that prevents routing traffic to a broken instance.

**Q: How do observability tools help with prod-only bugs specifically?**

Locally you have the debugger and you are the only user. In production you have thousands of requests and you need to find one. Structured logs with a request ID let you jump from the frontend error to one backend trace. Metrics like error rate, latency percentiles, and pool queue depth tell you if the failure is for everyone or just one route. Traces show you which hop failed — maybe the proxy timed out before Node replied, or Node was waiting on the database. Without correlation IDs, you are searching logs by time and guessing. Good observability turns "works locally, breaks in prod" from a mystery into a lookup.

## 6. The Traps — What Goes Wrong in Production

Hardcoded localhost is the most embarrassing and most common. `fetch("http://localhost:4000/api/orders")` is in the frontend code or in an env file that was not updated. It works on your machine, it fails everywhere else because the user's browser tries to call their own laptop. The fix is to never hardcode hosts. Always read the API URL from config that is correct per environment, and for build-time frameworks like Next.js, remember that changing that value requires a new build.

Missing env var with no boot validation. The app starts, seems healthy, and then crashes on the first real request because `process.env.JWT_SECRET` is `undefined`. You see a 500 with no clear message because the error happened inside a middleware before your error handler. The fix is Zod validation at import time so the process crashes immediately on deploy with `JWT_SECRET is required`, which your deploy pipeline marks as failed before traffic shifts.

CORS not tested beyond localhost. You set `origin: "*"` locally to make life easy, then keep it in production, but you also use cookies. The browser blocks `*` with credentials, so auth breaks only in prod. Or you set `origin: "https://app.example.com"` but forget `https://www.app.example.com` or the preview deploys. The fix is to test CORS with the real origins in staging and to assert it in an integration test that actually sends an `Origin` header.

Migrations not run. You pushed code that reads a new column, CI passed against a freshly migrated test DB, but production's migration job was skipped or failed silently. Every request that touches that table returns 500. The fix is to make `migrate:deploy` a required step in the pipeline that blocks the deploy if it fails, and to make migrations backward compatible — add the column as nullable first, deploy code that handles both shapes, then backfill.

Stale build artifact. You changed an env var or a frontend API URL but did not rebuild. Or Docker used a cached layer with the old `dist`. Production runs last week's code while you stare at this week's source. The health endpoint with SHA catches this in seconds. In your pipeline, build is not optional — every deploy builds from scratch or uses a content hash.

TLS and cookie settings that only matter over https. Setting `SameSite=Lax` or forgetting `Secure` when the cookie must cross from `app.example.com` to `api.example.com` means the browser silently drops the cookie in production but not on `http` localhost. No error in backend logs, just an unauthenticated request. The fix is to set `Secure` and `SameSite=None` for cross-site cookies over https, and to test auth on an actual https staging deployment.

Reverse proxy swallowing errors. Nginx returns its own 502 or 504 with an HTML body that your frontend JSON parser chokes on. The app never saw the request, so there is nothing in app logs. If you only check app logs you will think the app is fine. Always check proxy and load balancer logs and make sure the proxy forwards headers, preserves the path, and has timeouts longer than your longest expected handler.

## 7. Compare With Related Concepts

API works locally but fails in production versus API is slow in production. These sound similar but you debug them differently. A failing API is a correctness or connectivity problem — wrong URL, missing secret, blocked network, CORS, bad migration. You look for errors, not latency: 4xx and 5xx, stack traces, connection errors, and browser console messages. You fix it by closing the parity gap that makes the request impossible.

A slow API is a performance problem — the request succeeds but takes too long. You look at latency percentiles, database query times, N+1 queries, missing indexes, cold starts, large payloads, and pool queueing. The fix is not a missing env var but an index, a cache, pagination, or moving work to a queue. One is "it cannot run there," the other is "it runs there but too slowly."

A useful rule is: if curl fails or the browser blocks it, treat it as this page — a parity gap. If curl succeeds but takes 4 seconds locally and 8 seconds in prod, treat it as a performance page — profile the query, check the index, check payload size, and check pool and cache behavior.

Local hard refresh versus production CDN caching is a related flavor of the same story. Locally you always see fresh code. In production a CDN or browser cache may still serve the old bundle that calls the old API path. A hard refresh fixes it for you but not for users. The real fix is cache-busting with content hashes and correct `Cache-Control` headers for API responses.

## 8. 🧠 The Memory Hook

Same chef, different kitchen. When the code works on your laptop but dies in production, the code is not the suspect — the kitchen is. Check the pantry — env vars and secrets — the door — CORS and TLS — the pipes — database and VPC — the recipe card — migrations — the oven — Node version — the pre-packed box — build artifact — and the waiter — reverse proxy. Diff the kitchens, do not stare at the recipe.
