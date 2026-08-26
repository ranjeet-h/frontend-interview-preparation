# How do you scale Node.js app

## 1. Why This Exists — The Problem First

Your API handled 200 requests per second comfortably at launch. Six months later, a marketing push sends 2,000 rps. Response times climb from 80ms to 4 seconds. You add a bigger server — same problem, just delayed. You spin up three more instances but users randomly get logged out because sessions live in memory on one box. You add Redis for sessions, instances scale horizontally, and now PostgreSQL hits its connection limit because each of eight Node processes opens its own pool of 20 connections.

Scaling Node.js is not one knob. It's a sequence of decisions: find the bottleneck, fix statefulness, multiply compute, then fix whatever becomes the new bottleneck — usually the database.

## 2. The Analogy — Make It Obvious

A popular food truck park.

**Vertical scaling** is upgrading one truck — bigger grill, more burners (more CPU cores via cluster/worker threads). Helps until the truck physically can't get bigger.

**Horizontal scaling** is adding more identical trucks and putting a sign at the entrance directing customers to the shortest line (load balancer). Works great — unless each truck keeps its own handwritten loyalty card list (in-memory sessions). Customers switch trucks and lose their stamp count.

**Architectural scaling** is the infrastructure around the park — a central kitchen that pre-preps ingredients (cache), a warehouse that supplies all trucks (read replicas), and a ticket system so orders don't pile up at one window (message queues).

The same codebase runs every truck. What changes is the configuration and the shared infrastructure they all depend on.

## 3. How It Actually Works — The Full Explanation

Scaling Node.js happens at three layers. Always measure first — scaling the wrong layer wastes money and adds complexity.

### Layer 1: Vertical scaling (one machine, more cores)

Node.js uses one core by default. On a multi-core server:

- **Cluster module** — fork one worker per CPU core, each handling HTTP connections
- **Worker threads** — offload CPU-bound work (image processing, hashing) within each worker
- **Process managers** — PM2 `instances: 'max'` wraps cluster with auto-restart

This is the cheapest first step. It doesn't help if your bottleneck is the database or if one machine isn't enough.

### Layer 2: Horizontal scaling (more machines)

Run N identical Node.js instances behind a load balancer (nginx, AWS ALB, Kubernetes Service).

Requirements:

- **Stateless application** — no in-memory sessions, caches, or WebSocket state tied to one instance
- **External session store** — Redis, database, or JWT (stateless auth)
- **Shared nothing** — any instance can handle any request
- **Health checks** — load balancer removes unhealthy instances

Container orchestration (Kubernetes, ECS) automates scaling instance count based on CPU/memory/request rate.

### Layer 3: Architectural scaling (fix the real bottleneck)

| Bottleneck | Solution |
|---|---|
| Repeated DB reads | Redis/Memcached caching |
| Write-heavy DB | Read replicas, sharding, connection pooling (PgBouncer) |
| Long-running tasks | Message queues (Bull/BullMQ, SQS, RabbitMQ) |
| Static assets | CDN (CloudFront, Cloudflare) |
| File uploads | S3 + presigned URLs, not local disk |
| WebSocket fan-out | Redis pub/sub adapter (Socket.IO), dedicated gateway |
| Connection exhaustion | Pool sizing: `max_per_instance = db_limit / num_instances` |

### The scaling order (practical)

1. **Measure** — APM, profiling, `clinic.js`, database slow-query logs
2. **Fix code** — N+1 queries, blocking sync calls, missing indexes
3. **Vertical** — cluster + worker threads on current hardware
4. **Cache** — Redis for hot reads, session store
5. **Horizontal** — multiple instances behind load balancer
6. **Database scale** — read replicas, pooling, sharding
7. **Async decouple** — queues for email, reports, image processing
8. **Microservices** — only when team/org boundaries require it, not as a default

## 4. Real Code — See It Working

**Stateless API with external session store**

```javascript
const session = require('express-session');
const RedisStore = require('connect-redis').default;
const { createClient } = require('redis');

const redisClient = createClient({ url: process.env.REDIS_URL });
await redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
}));
// Any instance can read any session — safe behind load balancer
```

**Connection pool sized for horizontal scale**

```javascript
const { Pool } = require('pg');

const NUM_INSTANCES = parseInt(process.env.NUM_INSTANCES, 10) || 4;
const DB_MAX_CONNECTIONS = 100;
const POOL_SIZE = Math.floor(DB_MAX_CONNECTIONS / NUM_INSTANCES) - 2;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: POOL_SIZE, // 4 instances × 23 = 92, under 100 limit
});
```

**Response caching with Redis**

```javascript
async function cacheMiddleware(ttlSeconds) {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl}`;
    const cached = await redis.get(key);
    if (cached) return res.json(JSON.parse(cached));

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      redis.setex(key, ttlSeconds, JSON.stringify(body));
      return originalJson(body);
    };
    next();
  };
}

app.get('/api/products', cacheMiddleware(60), async (req, res) => {
  const products = await db.products.findAll();
  res.json(products);
});
```

**Queue for async work — don't block the HTTP response**

```javascript
const { Queue, Worker } = require('bullmq');

const emailQueue = new Queue('emails', { connection: { host: 'redis' } });

app.post('/api/signup', async (req, res) => {
  const user = await db.users.create(req.body);
  await emailQueue.add('welcome', { userId: user.id, email: user.email });
  res.status(201).json({ id: user.id }); // fast response, email sent async
});

new Worker('emails', async (job) => {
  await sendWelcomeEmail(job.data.email);
}, { connection: { host: 'redis' } });
```

**Cluster for vertical scaling on one machine**

```javascript
const cluster = require('cluster');
const os = require('os');

if (cluster.isPrimary) {
  for (let i = 0; i < os.cpus().length; i++) cluster.fork();
  cluster.on('exit', (worker) => cluster.fork());
} else {
  require('./server'); // each worker runs the full Express app
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: How do you scale a Node.js application?**

Measure the bottleneck first. Then: vertical scaling (cluster/worker threads), horizontal scaling (multiple stateless instances behind a load balancer), and architectural scaling (caching, read replicas, connection pooling, message queues, CDN). Stateless design is the prerequisite for horizontal scaling.

**Q: Why must the app be stateless for horizontal scaling?**

If session data or WebSocket connections live in one instance's memory, the load balancer can't freely route requests. Users hit the wrong instance and lose state. Externalize sessions (Redis), auth (JWT), and real-time state (Redis pub/sub).

**Q: What is the most common scaling mistake?**

Adding instances without fixing the database. Eight Node processes × 20 connections = 160 connections; PostgreSQL default max is often 100. The database becomes the bottleneck and connection errors look like application bugs.

**Q: When do you use caching vs read replicas?**

Caching for read-heavy, tolerably stale data (product catalogs, config). Read replicas for read-heavy data that must be fresher than cache TTL allows, or when cache invalidation is too complex. Often both — cache in front of replicas.

**Q: When do you split into microservices?**

When independent deployment, scaling, or team ownership of a specific domain justifies the operational cost. Not as a first scaling step. A well-structured monolith with queues and caching handles most traffic.

**Q: How do you handle WebSockets at scale?**

Sticky sessions (fragile) or a shared pub/sub layer (Redis adapter for Socket.IO) so any instance can broadcast to any connected client. Dedicated gateway services for very high fan-out.

## 6. The Traps — What Goes Wrong

**Scaling before measuring.** Adding Redis, Kubernetes, and read replicas when the real problem is a missing database index wastes months.

**In-memory sessions with multiple instances.** User logs in on instance A, next request hits instance B, session is gone. Fix: Redis session store or JWT.

**Connection pool per instance without math.** `max: 20` on 10 instances against a 100-connection database = guaranteed `too many connections` errors.

**Caching without invalidation.** Stale product prices after an admin update. Use TTL + event-driven invalidation, or cache only truly static data.

**Sticky sessions as a crutch.** Uneven load distribution — one "sticky" user on a hot instance while others idle. Prefer externalized state.

**Local filesystem storage.** Uploads saved to `./uploads` on one instance aren't visible to others. Use S3 or shared storage.

**Synchronous CPU work on the hot path.** No amount of horizontal scaling helps if each request blocks the event loop for 2 seconds. Fix with worker threads or offload to a queue first.

## 7. Compare With Related Concepts

**Vertical vs horizontal scaling.** Vertical = bigger/fewer machines (cluster uses more cores). Horizontal = more machines (load balancer). Rule: vertical is cheaper and simpler; horizontal is required beyond one machine's capacity.

**Scaling vs optimizing.** Optimizing code (fix N+1, add index) is free and often 10× improvement. Scaling multiplies cost. Always optimize first.

**Node.js cluster vs Kubernetes replicas.** Both run multiple instances. Cluster is in-process on one machine. Kubernetes runs containers across machines with auto-scaling, health checks, and rolling deploys. In K8s you often skip cluster and run one process per pod.

**Caching vs CDN.** Redis caches API/DB responses server-side. CDN caches static assets and cacheable API responses at the edge, closer to users. Rule: CDN for static files and public cacheable content; Redis for dynamic server-side caching.

## 8. 🧠 The Memory Hook — What Sticks

Find the bottleneck, make the app stateless, then multiply instances — but every new instance multiplies database connections, so scale the data layer in the same breath. Scaling Node without scaling PostgreSQL is building more food trucks without expanding the central kitchen.
