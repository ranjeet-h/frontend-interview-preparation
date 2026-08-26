# What is connection pooling

## 1. The Real-World Problem — When You Actually Hit This

It's launch day. Your marketing push goes out at 9 AM, traffic jumps tenfold, and by 9:15 your checkout endpoint is timing out. Here's the confusing part: your app servers look fine, the database CPU is sitting at 30%, yet requests take 6–8 seconds before failing. You dig into the logs and find two things. First, every single request was doing this:

```js
const client = new Client(); // fresh TCP + TLS + login, every request
await client.connect();
```

So each request paid the full price of opening a brand-new database connection before it even touched data. Second, around 9:40, Postgres starts rejecting everyone outright with `FATAL: sorry, too many clients already` — you blew past its `max_connections` limit because hundreds of half-finished connections piled up while a slow report query hogged the ones that did connect.

Nothing about your queries got slower. The database wasn't overloaded with work. It was overloaded with *connections*. This is the exact pain connection pooling exists to prevent, and almost every backend hits it once before they internalize it.

## 2. The Analogy — Make the Mechanic Obvious

Think of a company with a fleet of cars parked downstairs, and keys held at reception.

An employee who needs to run an errand doesn't buy a new car, drive it once, and abandon it on the highway. That would be insane — buying a car takes days and costs a fortune. They walk to reception, sign out the keys, drive, come back, and hand the keys over so the next person can use it immediately. The company owns maybe ten cars, not one per employee, because at any given moment only a handful of people actually need to be driving.

Every piece of that maps to the real mechanic:

- **Buying a car** = opening a new database connection: TCP handshake, TLS handshake, authentication, and on PostgreSQL specifically, the server literally forks a new operating-system process for you. Slow and expensive.
- **The fleet** = the connection pool: a small set of already-open, already-authenticated connections kept warm.
- **Signing out keys** = checking out a connection from the pool. You have it exclusively — nobody else drives your car while you hold the keys.
- **Returning keys** = releasing the connection back. If you never return them (a leak), eventually reception has zero keys left and nobody can go anywhere.
- **Ten people waiting at reception for a car** = pool exhaustion. The queue grows, and after some wait you give up and take the bus (the acquire timeout fires).
- **The parking lot with limited spaces, shared by all departments in the building** = the database's `max_connections`. Every team's fleet draws from the same lot. Ten teams × twenty cars each = a lot that fits five.
- **A valet company that manages one big shared lot for the whole office building** = PgBouncer, an external pooling proxy.

Keep this picture. The rest of the page is just giving names to things you already understand.

## 3. The Full Explanation — How It Actually Works

**Why a connection is expensive in the first place.** Opening one database connection isn't one operation — it's a chain of them:

1. **TCP handshake** — one full network round trip before any data moves.
2. **TLS handshake** — if you're connecting securely (you should be), another one or two round trips plus certificate verification and actual cryptographic work on both CPUs.
3. **Authentication** — one or more round trips where the client proves who it is (Postgres SCRAM-SHA-256 involves multiple exchanges).
4. **Backend setup** — and here's the part most people miss: PostgreSQL spawns a **separate OS process per connection**, allocating several megabytes of memory for it up front and registering it with the scheduler. MySQL uses a thread per connection, which is lighter but still costs memory and scheduling overhead.

Add it up and a fresh connection commonly costs tens of milliseconds plus real permanent server memory — paid *before* your query runs. At 500 requests per second with no pooling, you're burning most of your latency budget and megabytes of RAM just saying hello. And the database has a hard ceiling (`max_connections`, often 100–500 on Postgres precisely *because* each connection is a process) after which it refuses new clients entirely.

**What the pool actually does.** A connection pool sits in your application process. At startup (or lazily), it opens some connections, authenticates once, and keeps them alive. When your code needs the database, it borrows one instantly — no handshake, no auth, no fork. While borrowed, it's yours alone, exactly like having your own connection. When you release it, it goes back to the pool, gets checked for health (many pools run a cheap validation like `SELECT 1` or rely on TCP liveness), and serves the next borrower. If a connection dies (network blip, DB restart), the pool notices when you return it and quietly opens a replacement.

**The four knobs you'll actually tune.**

**Min size** — how many connections stay open even when nothing is happening. This is your warm floor: without it, the first burst of morning traffic pays the connection-opening tax all at once.

**Max size** — the hard cap on connections this pool will ever open. This is the single most important number on the whole topic, and we'll do the math below.

**Idle timeout** — how long a connection can sit unused before the pool closes it. Two reasons this matters: it frees server resources during quiet hours, and — sneaky one — cloud load balancers and NAT firewalls silently kill idle TCP connections (AWS NLB, for example, drops them at ~350 seconds). A dead connection that looks alive produces "Connection terminated unexpectedly" errors on reuse, so your idle timeout should fire well before the infrastructure does.

**Acquire timeout** — how long a request waits in line for a free connection before failing fast. Without this, exhausted pools turn into unbounded queues and your whole service hangs instead of erroring cleanly. Failing fast is a feature.

**Pool sizing math — why "more" makes things worse, not better.** Here is the counterintuitive core of the topic: **a bigger pool does not make queries run faster.** Your database executes queries with a fixed number of CPU cores and disks. Whether 20 connections or 200 want work done, the hardware can only do so much at once. Beyond the point where the database is saturated, extra active connections don't add throughput — they add contention: the OS context-switches between processes, caches get thrashed, and transactions hold locks longer because they wait longer for CPU. Throughput actually *drops*. Teams routinely watch a 200-connection pool benchmark slower than a 20-connection pool against the same Postgres.

So how many do you need? Think in terms of *concurrency*, not rate. Little's law says:

```txt
concurrent queries ≈ queries per second × average query duration in seconds
```

If your app issues 1,000 queries/sec and each takes 20 ms on average, you only ever need about 1,000 × 0.02 = **20 connections doing work simultaneously**. A pool of 25–30 covers it with headroom. The classic starting heuristic from the HikariCP community (battle-tested in Java land): for a service with a *dedicated* database box, start around `(CPU cores × 2) + effective disk spindles` — roughly 2–4× core count — and adjust from measured reality, not vibes.

Two corrections to naive math. First, that number is *per application process* only if the DB serves just that process. In the real world you have 8 instances × 30 pool size = 240 potential connections against a Postgres configured for 100. The sum of all your pools must fit inside the server's budget. Second, if a single query takes seconds, no pool size saves you — which brings us to exhaustion.

**Exhaustion under slow queries — the failure everyone meets.** The nastiest production mode of a pool isn't misconfiguration — it's a slow query turning into a total outage. Watch the chain: one report query loses its index and starts taking 8 seconds instead of 40 ms. Traffic keeps arriving, each request needs a connection, connections are all stuck on that query, a queue forms in front of the pool, acquire timeouts start firing, and suddenly *every* endpoint fails — including ones touching completely unrelated tables. Meanwhile database CPU might sit at 30%, which is exactly what makes this confusing at 2 AM.

The lesson: the pool converts one slow query into an app-wide outage by being the shared bottleneck. Defenses, in order: fix the underlying query ([EXPLAIN ANALYZE](./what-is-explain-analyze.md) is how), set `statement_timeout` so no query may run forever, set `idle_in_transaction_session_timeout` so a forgotten open transaction can't squat a connection indefinitely, and let the acquire timeout fail fast so the blast radius stays bounded.

**Leaks — connections that never come home.** A connection leak is a borrowed connection that never gets released — usually because the release line sits after code that threw an exception. One leaked connection per error sounds harmless until you realize errors happen hourly, the pool drains like a slow puncture, and by day three you have a mysterious "pool exhausted" outage with no recent deploy to blame. Good pools help you catch this: many expose a leak-detection threshold that logs a warning (often with the stack trace that borrowed the connection) when something is checked out too long. Node's `pg` emits pool events you can alert on, and simply graphing "connections currently checked out" catches the sawtooth drain immediately. The structural fix is `try/finally` — shown below — so release happens on every path, success or crash.

**Server-side limits and PgBouncer.** Zoom out to the whole system: every app instance runs its own pool, and all of those pools share one database with one `max_connections`. Postgres also reserves a few slots (`superuser_reserved_connections`) so an admin can still get in when everything else is exhausted — which tells you how expected this failure is.

When you have dozens of app instances (or thousands of short-lived serverless functions), client-side pooling alone stops fitting the budget. That's where **PgBouncer** comes in: a tiny proxy that sits between your apps and Postgres. Thousands of lightweight client connections funnel into it; it multiplexes them onto a much smaller number of real Postgres connections. Its three modes matter for interviews:

- **Session pooling** — a client owns a server connection for its whole session. Safe for everything, saves little.
- **Transaction pooling** — a server connection is assigned per transaction and returned the instant it commits. Maximum savings, but session state breaks: `SET` variables vanish, session-level advisory locks misbehave, `LISTEN/NOTIFY` doesn't work. (Modern PgBouncer ≥ 1.21 does track protocol-level prepared statements in transaction mode, which used to be the classic dealbreaker.)
- **Statement pooling** — autocommit only; anything multi-statement breaks.

Managed equivalents exist everywhere: RDS Proxy on AWS, built-in poolers elsewhere. Rule of thumb: client-side pools for a handful of long-lived instances; put a proxy like PgBouncer in front when instances multiply or become ephemeral.

**How this connects to transactions.** One subtlety worth knowing cold: the moment you check out a connection and send your first statement, you've implicitly opened a transaction, and it stays open until commit or rollback. Which means the connection — and any row locks it holds — is pinned for as long as you hold it. If you check out a connection, then `await fetch(somePaymentAPI)` inside that transaction, you've held a database lock across a multi-second external call. Do that a few hundred times and your pool is gone, your locks pile up, and you're one step from [deadlocks](./how-do-you-prevent-deadlocks.md). Transactions should wrap database work, not human-scale waits — see [transactions](./what-is-a-transaction.md) for that side of the contract.

## 4. See It In Practice — Real Code or Queries

**Node.js with `node-postgres` — a correctly configured pool and the borrow/return pattern:**

```js
const { Pool } = require('pg');

// One pool per process, created once at startup — never per request.
const pool = new Pool({
  host: 'db.internal',
  database: 'orders',
  user: 'app_user',
  password: process.env.DB_PASSWORD,

  max: 20,                    // concurrency math above said ~20 was enough
  min: 4,                     // keep a warm floor so morning bursts skip the handshake tax
  idleTimeoutMillis: 30_000,  // recycle quiet connections BEFORE the load balancer kills them (~350s on AWS NLB)
  connectionTimeoutMillis: 5_000, // fail fast when exhausted instead of hanging forever
});

// Idle clients sometimes die (DB restart, network blip). Log it so it's visible.
pool.on('error', (err) => console.error('idle client error', err));

// Multi-statement work: check out ONE client so everything shares a transaction.
async function transferFunds(fromId, toId, amount) {
  const client = await pool.connect(); // borrow keys from reception
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE accounts SET balance = balance - $1 WHERE id = $2',
      [amount, fromId],
    );
    await client.query(
      'UPDATE accounts SET balance = balance + $1 WHERE id = $2',
      [amount, toId],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK'); // undo partial work...
    throw err;                       // ...and still surface the problem
  } finally {
    client.release(); // THE critical line: runs on success AND on error
  }
}

// Simple one-shot queries: pool.query() borrows and releases for you internally.
const orders = await pool.query('SELECT * FROM orders WHERE user_id = $1', [
  userId,
]);
```

Notice the shape of the safe version: `try` wraps the work, `finally` guarantees `release()`. Delete the `finally` and every thrown error leaks one connection permanently.

**PostgreSQL — watching the server side of the bargain:**

```sql
-- What's the ceiling?
SHOW max_connections;            -- e.g. 100, minus reserved admin slots

-- Who's connected right now, grouped by state?
SELECT state, COUNT(*)
FROM pg_stat_activity
GROUP BY state;

-- The smoking gun during an exhaustion incident:
-- many rows sitting in 'idle in transaction' means someone opened a
-- transaction and walked away. Find and fix that code path.

-- Cap how long any single query from the app role may run, so one bad
-- report can't hold 20 pool connections hostage for minutes:
ALTER ROLE app_user SET statement_timeout = '5s';
```

**Python with SQLAlchemy — the same knobs, different ecosystem:**

```python
from sqlalchemy import create_engine

engine = create_engine(
    DATABASE_URL,
    pool_size=10,        # steady-state connections kept open
    max_overflow=5,      # allows 5 EXTRA temporary connections under burst (hard ceiling = 15)
    pool_timeout=30,     # acquire timeout: raise after 30s of waiting in line
    pool_recycle=1800,   # replace connections older than 30 min (dodges firewall idle kills)
    pool_pre_ping=True,  # validate a connection before handing it out; replaces stale ones silently
)
```

Same concepts wearing different names: `pool_size` + `max_overflow` = max, `pool_timeout` = acquire timeout, `pool_recycle` = idle/lifetime management, `pool_pre_ping` = health validation on borrow.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is connection pooling and why does it matter?**

It's a cache of open, authenticated database connections kept inside your application. Instead of paying the full setup cost — TCP handshake, TLS handshake, auth round trips, and on Postgres a forked server process with megabytes of memory — for every request, you pay it once per pooled connection and reuse it thousands of times. It matters for three separate reasons: latency (setup is tens of milliseconds before your query even starts), resource usage (each Postgres connection is a real process holding real memory), and survival (the database enforces a hard `max_connections` ceiling, so uncontrolled connection creation eventually causes outright rejections, not just slowness).

**Q: Why not just open a connection per request? It seems simpler.**

It is simpler, and at 10 requests per second it works fine — that's why it survives development and code review. The bill arrives with scale. Each open costs multiple network round trips plus crypto plus auth, so you're adding tens of milliseconds of pure overhead to every request, exactly when you care most about latency. Worse, under a traffic spike the opens arrive faster than they finish, they pile up, and you slam into `max_connections` — at which point the database rejects *everyone*, including traffic that had nothing to do with the spike. Pooling turns that unbounded, self-amplifying cost into a fixed, predictable one.

**Q: Is a bigger pool always faster?**

No — and believing it is the mark of a junior answer. Query speed is limited by the database's CPU, memory, and I/O, not by how many clients are asking. Once the database is saturated, additional active connections don't create throughput; they create overhead: OS context switching between connection processes (expensive on Postgres, where each connection is a forked process), CPU cache thrashing, and longer lock hold times because transactions wait longer for their slice of CPU. Benchmarks regularly show throughput falling as pool size climbs past saturation. Size by concurrency: roughly `requests per second × average query seconds` (Little's law), plus modest headroom. Twenty connections executing nonstop beat two hundred connections fighting.

**Q: Walk me through what happens when a pool is exhausted.**

Requests needing the database queue up in front of the pool. Each waiter burns its acquire timeout — say 5 seconds — then throws a "timeout acquiring connection" error, which surfaces as a 500 or 503 to users. Crucially this hits *every* feature using that pool, even ones whose queries are trivially fast, because the bottleneck is the shared pool, not their queries. Meanwhile the cause is usually invisible on dashboards: database CPU looks calm because the connections aren't busy computing, they're stuck on one slow query, a long-idle-in-transaction session, or a leak. Recovery means killing or fixing whatever holds the connections; prevention means `statement_timeout`, `idle_in_transaction_session_timeout`, fail-fast acquire timeouts, and alerting on checked-out-connection counts.

**Q: What is a connection leak and how do you detect one?**

A connection that was borrowed and never released. It almost always comes from missing cleanup on the error path — `client.release()` written after the happy-path logic instead of in a `finally`, so every exception permanently removes one connection from circulation. The signature is a slow drain: checked-out connections creep upward over hours or days, latency creeps with them, then one day the pool is empty and you have an outage with no obvious trigger. Detection: log or alert when a connection stays checked out longer than a threshold (HikariCP calls this `leakDetectionThreshold` and prints the borrowing stack trace; SQLAlchemy exposes similar diagnostics; `pg` lets you instrument events), and simply chart "in-use connections" — a sawtooth that trends upward is the leak. Prevention is structural: `try/finally` or language equivalents (context managers in Python, `using` in C#) so release is unavoidable on every path.

**Q: Explain min size, max size, idle timeout, and acquire timeout.**

Min size is the floor of warm connections kept open even at 3 AM, so the first traffic burst doesn't pay setup costs all at once. Max size is the hard ceiling the pool will never exceed — your claim on the database's finite connection budget. Idle timeout closes connections that have been unused too long, both to give resources back to the server during quiet periods and — practically important in the cloud — to cycle connections before load balancers and firewalls silently kill idle TCP sessions, which otherwise produce "connection terminated unexpectedly" errors on later reuse. Acquire timeout bounds how long a caller waits in line for a free connection before failing fast; it's what converts a hung, unbounded queue into a clean, alertable error.

**Q: You have 10 app instances, each with a pool max of 30, and Postgres `max_connections` is 100. What happens?**

Do the multiplication before answering: 10 × 30 = 300 potential connections against a ceiling of 100. On a normal day you won't feel it — pools open connections lazily, so you cruise along at maybe 60 total. Then one incident (deploy restarts, traffic spike, slow query backlog) pushes every instance toward its own max simultaneously, total demand crosses 100, and Postgres starts rejecting new connections with "too many clients". Because each instance only knows about itself, no amount of client-side tuning fixes this. Options, best first: lower per-instance pool sizes so the sum fits comfortably (e.g., 10 × 8 = 80, under the ceiling with headroom for admins and migrations), and/or put PgBouncer or RDS Proxy in front so the database sees a small fixed number of real connections regardless of how many clients exist behind it.

**Q: What is PgBouncer and when would you reach for it?**

An external connection pooler — a lightweight proxy between applications and Postgres. Clients connect to PgBouncer; PgBouncer holds the small set of real Postgres connections and lends them out per session or per transaction. You reach for it when client-side pooling stops fitting the math: many app instances, autoscaling groups, or serverless functions whose aggregate pools exceed `max_connections`. Its pooling modes trade safety for savings: session mode keeps a server connection for a client's whole session (safe, minimal savings); transaction mode reassigns the server connection after every commit (huge savings, but breaks anything tied to session state — `SET` variables, session advisory locks, `LISTEN/NOTIFY`; protocol-level prepared statements are supported from PgBouncer 1.21 onward); statement mode is autocommit-only. Transaction mode is the common production choice once the app avoids session-state assumptions.

**Q: How do connection pools interact with transactions?**

Checking out a connection and running your first statement implicitly begins a transaction; committing or rolling back ends it. While it's open, the connection can't serve anyone else and may hold row locks — so the cardinal rule is: never hold a checked-out connection across a slow non-database operation. Calling a payment API or sending email *inside* an open transaction pins a pool slot and possibly locks for seconds; a burst of those empties the pool and stalls the entire app. Keep transactions tight around database statements, and structure code so external calls happen before checkout or after release. Related trap: forgetting that with transaction-mode PgBouncer, anything you `SET` on the connection may not survive to your next statement, because your next statement might ride a *different* physical connection.

**Q: Why is connection handling painful in serverless (Lambda-style) environments?**

Because the unit of scale is the function instance, and each instance typically builds its own pool on first invocation. A thousand concurrent executions means up to a thousand independent pools, each wanting its own connections — against a database that tops out in the hundreds. Cold-start connection storms follow, then "too many clients", then an outage that scales perfectly with your success. Fixes: initialize the pool outside the handler so warm instances reuse it (helps, doesn't solve), shrink per-instance pool sizes to 1–2, and put a dedicated proxy between functions and the database — RDS Proxy on AWS, PgBouncer elsewhere — so the database sees dozens of stable connections instead of thousands of ephemeral ones. HTTP-based data APIs (which avoid persistent connections entirely) are the other escape hatch.

**Q: How does connection pooling affect frontend clients?**

Indirectly, through everything downstream. A healthy pool is part of why the API answers in double-digit milliseconds; an exhausted pool shows up in the browser as 5-second hangs followed by 503s, retry storms from the client making things worse, and users abandoning carts. There's no direct contract — the frontend shouldn't know pools exist — but the practical implications are real: backends should fail *fast* on pool exhaustion (acquire timeouts) so the frontend gets an immediate error it can show rather than a spinner; retries need exponential backoff so client retries don't amplify an exhausted pool into a longer outage; and frontend observability (tracking 503 rates and time-to-first-byte spikes) often provides the earliest signal that a pool is draining.

**Q: What would you monitor to catch pool problems before users do?**

On the app side: connections currently checked out (a rising sawtooth = leak), waiters queued for a connection, and acquire-timeout count — the moment this leaves zero, something is wrong. On the database side: total connections from `pg_stat_activity`, ideally split by state, with special attention to `idle in transaction` (someone forgot to close a transaction) and long-running queries. Correlate with deploy markers: pool problems love to start with a new slow query — [debug it](./how-do-you-debug-a-slow-query.md) before touching pool sizes. Alert thresholds matter more than dashboards here, because the failure mode is gradual right up until it's total.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: "More connections = more throughput," so set max = 500.**

The wrong assumption is that the pool is a throttle you can loosen for free. Reality: the database is the bottleneck, not the pool. Past saturation, hundreds of active Postgres connections mean hundreds of OS processes context-switching, megabytes upon megabytes of connection memory, and transactions holding locks longer because each gets a thinner slice of CPU. What actually happens: latency rises, lock contention climbs, and throughput measurably *drops* versus a smaller pool — while the fix (raising `max_connections`) eats server memory that could have gone to the buffer cache. Fix: compute concurrency honestly (rate × duration), start near `(cores × 2)` for a dedicated box, load-test, and let measurements move the number.

```js
// The oversize instinct:
const pool = new Pool({ max: 500 });  // 500 processes on the DB, all fighting

// The measured version:
const pool = new Pool({
  max: 20,                      // sized from QPS x avg query time
  connectionTimeoutMillis: 5_000, // overflow fails fast and alerts instead of drowning the DB
});
```

**Trap 2: Releasing the connection without `try/finally`.**

The wrong assumption is that the release line always runs. It doesn't — any exception between checkout and release skips it. What actually happens is the silent killer from Section 3: each error permanently removes one connection from the pool. With a max of 20 and one leaking error per hour, the app dies roughly a day later, far from the buggy deploy, and nobody connects the two. Fix: make release structurally guaranteed.

```js
// Leaky version — one throw = one permanently lost connection:
async function getBalance(id) {
  const client = await pool.connect();
  const res = await client.query('SELECT balance FROM accounts WHERE id = $1', [id]);
  client.release();          // never reached if the query throws
  return res.rows[0];
}

// Fixed — finally runs on every path:
async function getBalance(id) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT balance FROM accounts WHERE id = $1', [id]);
    return res.rows[0];
  } finally {
    client.release();
  }
}
```

(For plain queries prefer `pool.query()`, which handles borrow-and-release internally — check out a client manually only for transactions.)

**Trap 3: Creating the pool inside a serverless function handler.**

The wrong assumption is that a function instance behaves like a long-lived server, so "create a pool" is harmless boilerplate. But a Lambda-style instance may handle one invocation and freeze, and thousands of instances run concurrently — each executing your pool constructor. What actually happens: connection counts explode to thousands against a `max_connections` in the low hundreds, cold starts slow down (every init pays full TCP+TLS+auth), and the database starts refusing clients during exactly the traffic you scaled up for. Fix: build the pool once per container *outside* the handler so warm invocations reuse it, keep per-instance max tiny (1–2), and put RDS Proxy or PgBouncer in front so the database sees a bounded set of connections no matter how many instances exist behind the proxy.

**Trap 4: Holding a connection across a slow external call.**

The wrong assumption is that a checked-out connection is free to hold while you do other work. But checkout usually means an open transaction, and an open transaction holds locks and a pool slot. What actually happens: `await paymentAPI.charge()` takes 3 seconds, a burst of 20 concurrent checkouts pins all 20 pool connections for 3+ seconds each, the queue backs up, acquire timeouts cascade app-wide — and if other transactions touch the locked rows, they queue too, stacking into deadlock territory. Fix: audit every place a connection (or ORM session) is open, move external calls outside the transaction boundary, and enforce `idle_in_transaction_session_timeout` on the server so a violation becomes a loud, fast error instead of a silent stall.

**Trap 5: Trusting idle connections that the network already killed.**

The wrong assumption is that a pooled TCP connection stays valid as long as nobody touched it. Cloud load balancers and NAT gateways drop idle TCP flows (AWS NLB at ~350 seconds) *without telling either end*. What actually happens: overnight-low-traffic connections die silently; the first request after the quiet period grabs a corpse and fails with "Connection terminated unexpectedly"; the pool replaces it; the retry succeeds — so users see random one-off errors every morning and logs show nothing systematic. Fix: set the idle timeout comfortably below the shortest idle-kill in the network path (plus `pool_recycle`/keepalive equivalents), and enable validation-on-borrow (`pre_ping` in SQLAlchemy) so dead connections are detected and replaced invisibly.

## 7. Compare With Related Concepts

**Connection vs session vs transaction.** A connection is the physical pipe: the TCP link plus, on Postgres, the live server process backing it. A session is the state that lives on top of that connection while it's yours: `SET` variables, temp tables, cursors, session-level advisory locks, and any currently open transaction. A transaction is the unit of atomic work *within* a session — `BEGIN` to `COMMIT`. One connection carries a sequence of sessions' lifetimes; one session carries many transactions over time. Pooling recycles connections, which is exactly why transaction-mode PgBouncer can break sessions: consecutive transactions from one logical client may ride different physical connections, so anything stored *on* the session evaporates. Rule: pool connections freely, but never write logic that depends on which connection — and therefore which session — you happen to get.

**Client-side pool vs pooling proxy (PgBouncer/RDS Proxy).** A client-side pool lives inside each application process and only knows about itself; a proxy sits between all clients and the database and enforces one global connection budget. A single monolith with two app instances needs only the client-side pool. Fifty microservice instances or autoscaling serverless functions need the proxy, because no amount of per-instance tuning controls the *sum*. Rule: count `instances × pool_max` against `max_connections` — if the product can't be trusted to stay under, put a proxy in front.

**Pool max vs database `max_connections`.** They sound like the same knob but live on opposite sides. Pool max is a *client's promise* about its own behavior; `max_connections` is the *server's hard wall*, enforced with rejection errors. Nothing stops ten clients each promising 30 from hitting a wall of 100 together — the promises don't coordinate. Rule: the server limit is the truth; every client-side number is just a local guess that must sum beneath it.

**Connection pool vs thread/process pool.** Both reuse expensive resources, which invites confusion, but they pool different layers. Thread pools parallelize your *computation*; connection pools reuse the *database pipe*. They compose — a worker thread borrows a connection, runs a query, returns it — but sizing one tells you nothing about the other. Rule: size the thread pool for CPU-bound parallelism, size the connection pool for database concurrency, and never assume one implies the other.

## 8. 🧠 The Memory Hook

A database connection is a rented car, not a disposable cup — buying one per trip (TCP + TLS + auth + a forked Postgres process) is ruinous, so keep a small warm fleet, sign the keys out and *always* return them, and remember the parking lot (`max_connections`) belongs to everyone in the building. When all the cars are out, the answer is never "buy more cars" — it's "find out who's joyriding" (slow queries, leaks, transactions held across API calls).
