# Rate Limiter

## 1. Why This Exists — The Problem First

Your API goes viral. One client sends 50,000 requests per second. Your database melts. Legitimate users get timeouts. Your cloud bill spikes because you scaled out to survive abuse instead of stopping it at the door.

Without rate limiting, every request is treated equally — the scraper, the buggy retry loop, and the paying customer all hit the same expensive path. Rate limiting is the bouncer: it decides how many requests a caller is allowed in a time window, and turns away the rest before they touch your core system.

This page is about the **algorithms** that power rate limiting — not how to design a distributed rate-limiter service end to end. In an interview, you name the algorithm, explain its trade-offs, and say where it fits.

## 2. The Analogy — Make It Obvious

Think of a **theme park ride** with a capacity rule: only so many people per minute.

**Token bucket** — the ride hands out wristbands at a steady rate (say, 10 per minute). You can save unused wristbands in your pocket up to a limit. Show up with 30 saved wristbands and you and your friends rush in all at once. But if your pocket is empty and no new wristbands have been issued, you wait.

**Leaky bucket** — people enter a waiting room, but the ride only lets people out at a fixed pace. If the waiting room fills up, new arrivals are turned away. Even if 100 people arrive in one second, they still exit one at a time.

**Fixed window** — a sign says "max 100 riders per hour." The counter resets at the top of each hour. Simple, but 99 riders at 12:59 and 99 at 13:01 means 198 riders in two minutes — the rule said 100/hour but a burst slipped through the seam.

**Sliding window** — instead of resetting a blunt clock, you look at the last 60 minutes continuously. More accurate, but you have to remember every timestamp in that window.

Each analogy maps to a real algorithm with different burst tolerance, accuracy, and memory cost.

## 3. How It Actually Works — The Full Explanation

Every rate limiter answers two questions: **who** is being limited (user ID, IP, API key) and **how many requests** are allowed in **what time window**.

### Token bucket

A bucket holds tokens, up to a maximum capacity. Tokens are added at a fixed rate (refill rate). Each request consumes one token. If the bucket is empty, the request is rejected (or queued, depending on policy).

- **Burst-friendly:** a client that was idle can spend saved tokens in a short spike, as long as capacity allows.
- **Smooth average rate:** over time, throughput is capped by the refill rate.
- **Parameters:** `capacity` (max burst), `refill_rate` (tokens per second).

This is the most popular algorithm in production (API gateways, Stripe, many cloud providers) because it allows natural traffic bursts while enforcing a long-term average.

### Leaky bucket

Requests enter a queue (the bucket). The queue "leaks" — processes outgoing requests — at a fixed rate. If the queue is full, new requests are dropped.

- **Smooth output:** traffic leaving the system is steady regardless of input spikes.
- **Less burst on the server side:** protects downstream services from sudden floods.
- Often implemented with a FIFO queue plus a fixed processing rate.

Token bucket limits how fast you *enter* with saved credit. Leaky bucket limits how fast work *exits* to the backend. They feel similar but behave differently under burst: token bucket allows a client-side burst; leaky bucket shapes traffic before it hits the service.

### Fixed window counter

Divide time into windows (e.g., per minute). Count requests per key per window. If count exceeds the limit, reject.

- **Simple:** one counter per user per window.
- **Edge-case problem:** traffic can cluster at window boundaries (the "double burst" at 12:59 and 13:00).
- **Cheap:** minimal memory — one integer per key per window.

### Sliding window

Track request timestamps (or use an approximation like sliding window log or sliding window counter) within a rolling time span.

- **More accurate:** no boundary spike because the window moves continuously.
- **More memory or computation:** storing timestamps per request is expensive; hybrid approaches (e.g., sliding window counter combining fixed windows) trade accuracy for cost.

### Where this runs

In practice, rate limiting happens at the **API gateway**, **reverse proxy** (nginx, Envoy), **middleware** in your app, or a **dedicated service** (Redis-backed counters). The algorithm choice matters regardless of placement — distributed deployment adds consistency and race-condition concerns, but the core math is the same.

## 4. Real Code — See It Working

### Token bucket (in-memory, single process)

```javascript
class TokenBucket {
  constructor({ capacity, refillPerSecond }) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerSecond = refillPerSecond;
    this.lastRefillMs = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSec = (now - this.lastRefillMs) / 1000;
    // Add tokens proportional to elapsed time, never exceed capacity
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedSec * this.refillPerSecond
    );
    this.lastRefillMs = now;
  }

  allow() {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true; // request allowed
    }
    return false; // rate limited — return 429
  }
}

const limiter = new TokenBucket({ capacity: 10, refillPerSecond: 2 });
// Burst of 10 immediately, then steady ~2 req/sec
```

### Fixed window counter (Redis-style key per window)

```javascript
function windowKey(userId, windowSizeSec) {
  const windowStart = Math.floor(Date.now() / 1000 / windowSizeSec);
  return `ratelimit:${userId}:${windowStart}`;
}

async function allowRequest(redis, userId, limit, windowSizeSec) {
  const key = windowKey(userId, windowSizeSec);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, windowSizeSec);
  }
  return count <= limit;
}
```

### Leaky bucket (queue with fixed drain rate)

```javascript
class LeakyBucket {
  constructor({ capacity, leakPerSecond }) {
    this.capacity = capacity;
    this.queue = [];
    this.leakPerSecond = leakPerSecond;
    this.leaking = false;
  }

  enqueue(request) {
    if (this.queue.length >= this.capacity) {
      return false; // overflow — reject
    }
    this.queue.push(request);
    this.startLeaking();
    return true;
  }

  startLeaking() {
    if (this.leaking) return;
    this.leaking = true;
    const intervalMs = 1000 / this.leakPerSecond;
    const timer = setInterval(() => {
      const next = this.queue.shift();
      if (next) next(); // process one request
      if (this.queue.length === 0) {
        clearInterval(timer);
        this.leaking = false;
      }
    }, intervalMs);
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is rate limiting and why do systems need it?**

Rate limiting caps how many requests a client can make in a given period. It protects your infrastructure from overload, prevents abuse and scraping, ensures fair usage across tenants, and can enforce billing tiers (free vs paid). Without it, one bad actor or one buggy client can degrade the entire system.

**Q: Explain the token bucket algorithm.**

A bucket holds tokens up to a maximum capacity. Tokens refill at a constant rate. Each request costs one token. If tokens are available, the request proceeds; if not, it's rejected (HTTP 429). The key property is **burst allowance**: an idle client accumulates tokens and can send a short burst, but the long-term average rate is bounded by the refill rate. Most production API rate limiters use some variant of this.

**Q: Explain the leaky bucket algorithm.**

Incoming requests enter a queue with fixed capacity. Requests leave the queue ("leak") at a constant rate. If the queue is full, new requests are discarded. Unlike token bucket, the output rate to the downstream service is smoothed — even if clients send bursts, the server processes at a steady pace. Good when you need to protect a fragile backend from traffic spikes.

**Q: What is the difference between token bucket and leaky bucket?**

Token bucket controls how fast a **client** can consume allowance, and allows bursts up to bucket capacity. Leaky bucket controls how fast the **server** processes work, queuing excess and dropping overflow. Token bucket = "you have credits to spend." Leaky bucket = "we process at this pace, queue or drop the rest."

**Q: Explain fixed window rate limiting.**

Count requests per user per fixed time window (e.g., 100 requests per minute). Reset the counter when the window rolls over. Simple and memory-efficient, but suffers from the **boundary problem**: a client can send 100 requests at 12:59:59 and another 100 at 13:00:01 — 200 requests in two seconds while the "per minute" limit is 100.

**Q: How does sliding window improve on fixed window?**

A sliding window looks at the last N seconds continuously rather than a hard clock boundary. Every request is checked against recent history in a rolling interval. This eliminates boundary spikes. The trade-off is higher memory (storing timestamps) or more complex approximations (sliding window counter) to reduce cost.

**Q: Which algorithm would you choose for a public API?**

Token bucket for most public APIs: it handles natural client bursts (page loads firing parallel requests) while enforcing a steady average. Pair it with clear 429 responses and `Retry-After` headers. Use sliding window if you need stricter fairness and can afford the memory. Use leaky bucket if your downstream service cannot tolerate bursts at all.

**Q: What HTTP response should a rate-limited client receive?**

Typically **429 Too Many Requests**, with headers like `Retry-After` (seconds until retry is safe) and `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` so clients can back off intelligently instead of hammering.

**Q: How do you rate limit in a distributed system with multiple servers?**

Each server can't keep an isolated in-memory counter — a client could hit a different server every time and bypass the limit. Use a **centralized store** (Redis is common) with atomic increment operations, or **sticky routing** so a user always hits the same node (fragile). Redis `INCR` with TTL works well for fixed window; token bucket in Redis can use Lua scripts for atomic refill-and-consume. Expect small race windows unless operations are atomic.

## 6. The Traps — What Goes Wrong

**Trap: Treating rate limiting as only a security feature.**

It's also a **capacity planning** tool. Even trusted clients can overwhelm you during launches or retries. Rate limits protect you from your own success.

**Trap: Using fixed window without acknowledging the boundary burst.**

If you say "100 req/min" with fixed window, an interviewer may ask what happens at the window edge. If you can't explain the double-burst problem, you lose credibility. Either use sliding window or accept the approximation and say so.

**Trap: Confusing token bucket and leaky bucket.**

They are not interchangeable. Token bucket allows client-side bursts. Leaky bucket shapes server-side output. Pick based on whether you're protecting **ingress allowance** or **egress processing rate**.

**Trap: Returning 503 instead of 429.**

503 means "server error / overloaded." 429 means "you exceeded your quota." Clients handle them differently. A well-behaved SDK backs off on 429; it may retry aggressively on 503.

**Trap: No escape hatch for critical traffic.**

Internal health checks, payment webhooks, or admin operations may need separate limits or bypass rules. Blind global limiting can break monitoring and billing.

**Trap: Forgetting idempotency and retries.**

Clients that retry on timeout without exponential backoff will burn through their quota and make things worse. Document retry behavior alongside limits.

## 7. Compare With Related Concepts

| Concept | What it does | vs rate limiting |
|---|---|---|
| **Load balancer** | Distributes traffic across healthy servers | Spreads load; does not cap per-client usage |
| **Circuit breaker** | Stops calling a failing dependency | Reacts to failures; rate limiter prevents overload before failure |
| **Throttling** | Often used interchangeably with rate limiting | In some systems, "throttle" means slow down (queue) vs "limit" means reject — clarify in interviews |
| **Quota** | Total allowance over longer period (e.g., 1M API calls/month) | Rate limit = speed; quota = total budget |
| **Backpressure** | Slow down producers when consumers can't keep up | Leaky bucket is a form of backpressure on ingress |

**Rule of thumb:** use rate limiting at the edge to say "how fast"; use quotas for billing tiers; use circuit breakers when downstream is already unhealthy.

## 8. 🧠 The Memory Hook — What Sticks

Rate limiting is a bouncer with a counting method. **Token bucket** = wristbands you save and spend in bursts. **Leaky bucket** = waiting line that drains at a fixed pace. **Fixed window** = cheap but bursts at the clock seam. **Sliding window** = accurate but costs more memory. In interviews, name the algorithm, state the burst vs smooth trade-off, and mention 429 with `Retry-After`.
