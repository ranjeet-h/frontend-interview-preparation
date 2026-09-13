# Securing Public APIs: API Keys, Rate Limiting, CORS, and OWASP Top 10 API Security

## 1. Why This Exists — The Problem First

Imagine shipping a clean REST API for a high-growth SaaS platform. In staging, everything is fast, predictable, and elegant. Within 48 hours of mapping your production domain to the open internet without defensive controls, your infrastructure collapses:

A competitor spins up an automated scraper across 500 AWS Lambda instances, flooding your endpoints with 15,000 requests per second and dumping your entire product catalog and pricing dataset in under six minutes while exhausting your PostgreSQL connection pool. Simultaneously, a malicious website embeds a cross-origin script that tricks authenticated browser sessions into modifying account webhooks because your server blindly set `Access-Control-Allow-Origin: *` with credentials enabled. Worse still, a security researcher discovers that altering the query parameter from `GET /api/v1/invoices/1004` to `GET /api/v1/invoices/1005` returns the confidential billing data of a Fortune 500 client because your controller queried by primary key alone without checking tenant ownership. Finally, an attacker registers with a JSON payload containing `{"username": "attacker", "is_admin": true}`, and your backend blindly hydrates the ORM model, granting them instant root privileges.

Public APIs operate in a hostile environment by default. Automated botnets, credential stuffers, and malicious scrapers continuously probe every public IP address on the internet. Securing a public API is not a single configuration toggle; it is the discipline of layered defense-in-depth. Every layer—cryptographic credential storage, distributed rate limiting, browser origin boundaries, and object-level authorization—acts as an independent airlock so that the failure of any single component never compromises the system.

## 2. The Analogy — Make It Obvious

Think of a public API as an **International High-Security Commercial Airport Terminal**:

1. **The Perimeter Fence and Guard Post (HTTPS / Network Encryption):** The physical outer wall and secure roadways. No one can eavesdrop on conversations inside the perimeter or disguise the building's physical location.
2. **The Passport with Biometric Hash (API Keys & Cryptographic Storage):** When you arrive, you present a passport with an official prefix and security seal (`sk_live_...`). The border agency never keeps photocopies of unhashed passports on an open desk. Instead, they scan your passport, compute a one-way mathematical fingerprint (`SHA-256`), and match that fingerprint against their secure ledger. If you present a temporary training badge (`pk_test_...`), you can only access the flight simulator room, not real aircraft.
3. **The Automated Turnstile Gates (Rate Limiting via Token / Sliding Window):** The terminal entrance has turnstiles that dispense entry tokens at a fixed rhythm. A regular traveler walks through smoothly. A stampeding mob trying to force 500 people through in one second gets immediately blocked by the magnetic barrier, which flashes a screen: *"Queue full. Stand behind the yellow line for 30 seconds before retrying"* (`HTTP 429 Too Many Requests` with `Retry-After: 30`).
4. **The Authorized Transit Bus Agreement (CORS Governance):** When a private tour bus company drops passengers off at the terminal gate, security checks if that specific bus operator is on the approved partner manifest. If an unverified foreign vehicle pulls up attempting to send commands to baggage handlers, the airport rejects the vehicle immediately.
5. **The Boarding Pass & Gate Check (OWASP API1 BOLA / IDOR):** Even if you hold a valid passport (authenticated) and passed through the turnstile (rate-limited), when you reach Gate B14 for Flight 302, the gate agent checks your seat ticket. You cannot board Flight 900 or sit in Seat 1A (another customer's resource) just because you possess a valid passport.
6. **Luggage Size Constraints & Customs Inspection (OWASP API3 Mass Assignment & API4 Resource Limits):** Security scanners reject any crate exceeding standard baggage dimensions (payload size limits). Furthermore, customs agents open your luggage to ensure you did not pack an unauthorized pilot uniform inside a bag registered as personal clothing (DTO whitelisting / schema stripping).

## 3. How It Actually Works — The Full Explanation

**1. API Key Architecture, Prefixing, and Cryptographic Storage**

API keys are persistent machine-to-machine credentials used by server-side clients to authenticate API requests. A production-grade API key infrastructure requires three core components: structured prefixing, high-entropy secrets, and one-way cryptographic hashing at rest.

- **Key Formatting and Prefixing:** Never issue unformatted random strings. Use structured tokens: `[prefix]_[environment]_[random_bytes]` (e.g., `sk_live_9f83a1b2c3d4e5f6...` for live secret keys, `pk_test_4a5b6c7d...` for public test keys). Prefixes allow automated secret scanning engines (like GitHub Secret Scanning or TruffleHog) to immediately detect leaked credentials in public repositories. They also allow routing middleware to determine the key type and environment before querying the database.
- **Secure Key Generation:** Generate keys using cryptographically secure pseudorandom number generators (CSPRNG), such as `crypto.randomBytes(32)`. This produces 256 bits of entropy, rendering brute-force enumeration mathematically impossible.
- **Hashed Storage at Rest:** Never store plaintext API keys in your database. If the database is compromised, all customer integrations are exposed. When a user creates an API key:
  1. Generate the raw plaintext key once.
  2. Compute its cryptographic digest using `SHA-256`: `hash = SHA256(raw_key)`.
  3. Store the `hash`, a truncated display hint (e.g., `last4: "e5f6"`), the assigned `workspace_id`, and granular permission scopes (`['invoices:read', 'webhooks:write']`) in the database.
  4. Display the raw plaintext key to the user **exactly once** in the UI.
  5. On incoming requests via `Authorization: Bearer sk_live_...`, compute `SHA256(incoming_key)` and query the database by the resulting hash index.

**2. Rate Limiting Strategies and Distributed Redis Internals**

Rate limiting protects APIs against denial-of-service, brute-force credential stuffing, API scraping, and cascading downstream database outages. Relying solely on client IP addresses fails because enterprise clients often share a single NAT gateway IP, mobile carriers rotate IPs rapidly, and distributed botnets attack across thousands of residential proxy IPs. Production rate limiting must be multi-tiered: by API key for authenticated traffic, by IP for public unauthenticated endpoints, and by user/tenant for web application sessions.

- **Token Bucket Algorithm:**
  - A bucket holds a maximum capacity of $B$ tokens.
  - Tokens are continuously added at a fill rate of $r$ tokens per second.
  - Every incoming API request attempts to draw one token from the bucket. If tokens $> 0$, the request proceeds and tokens decrement by 1. If the bucket is empty, the request is immediately rejected with `429 Too Many Requests`.
  - *Why it works:* It accommodates legitimate, bursty traffic (up to capacity $B$) while strictly constraining sustained consumption to rate $r$.
- **Leaky Bucket Algorithm:**
  - Requests enter a FIFO queue (the bucket). The bucket leaks requests at a strict, constant outflow rate to the backend processor.
  - If incoming requests arrive faster than the leak rate, the queue fills up. Once the queue reaches capacity, new requests overflow and are rejected.
  - *Why it works:* It completely eliminates traffic bursts, enforcing a perfectly smooth request flow. Ideal for protecting fragile legacy systems or strict third-party payment gateways.
- **Sliding Window Log Algorithm (with Redis Sorted Sets):**
  - Uses a Redis Sorted Set (`ZSET`) where both the element member and its score represent the millisecond timestamp of an incoming request.
  - For each request:
    1. Remove all elements in the set with timestamps older than `now - window_size` using `ZREMRANGEBYSCORE`.
    2. Count the remaining elements in the set using `ZCARD`.
    3. If `count < limit`, add the current timestamp to the set using `ZADD`, set a key expiration via `PEXPIRE`, and allow the request.
    4. If `count >= limit`, reject the request with HTTP 429.
  - *Why it works:* It guarantees 100% boundary accuracy without the edge-burst vulnerability of fixed-window counters, at the expense of higher memory usage per active client.
- **Standardized HTTP 429 Headers:**
  - `X-RateLimit-Limit`: Maximum requests permitted within the current window.
  - `X-RateLimit-Remaining`: Number of requests remaining in the active window.
  - `X-RateLimit-Reset`: Unix epoch timestamp indicating when the quota fully replenishes.
  - `Retry-After`: Number of seconds the client must pause before retrying.

**3. CORS Governance (Cross-Origin Resource Sharing)**

CORS is a browser-enforced security mechanism, **not a server-side firewall**. It does not protect your API against backend scripts, cURL commands, or mobile applications. Its sole purpose is to instruct web browsers whether JavaScript running on `https://evil-site.com` is permitted to read responses from `https://api.yourdomain.com`.

- **Preflight Requests (`OPTIONS`):** For non-simple requests (requests using methods like `PUT` or `DELETE`, custom headers like `Authorization`, or `Content-Type: application/json`), the browser automatically dispatches an HTTP `OPTIONS` request before sending the actual request.
- **Origin Validation:** The server evaluates the incoming `Origin` header against a strict server-side whitelist.
  - If approved, the server responds with `Access-Control-Allow-Origin: https://app.yourdomain.com` and `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS`.
  - **Never use wildcard `*` with credentials:** If your API uses cookie-based authentication or `Authorization` headers, setting `Access-Control-Allow-Origin: *` is invalid in browsers when `Access-Control-Allow-Credentials: true`. Furthermore, dynamically echoing back whatever `Origin` the client sent without validation turns your API into an open vulnerability.
- **Preflight Caching (`Access-Control-Max-Age`):** Preflight `OPTIONS` calls double the latency of every API request. Set `Access-Control-Max-Age: 86400` (24 hours) so browsers cache the preflight permission and execute subsequent requests immediately.

**4. OWASP API Security Top 10 Core Defenses**

The Open Web Application Security Project (OWASP) identifies the most severe security risks targeting modern APIs:

- **API1: Broken Object Level Authorization (BOLA / IDOR):**
  - *The Vulnerability:* The endpoint exposes an object identifier (e.g., `/api/v1/workspaces/8821/reports/402`). The backend verifies that the user is logged in, but fails to check if report `402` belongs to workspace `8821` and if the current user belongs to workspace `8821`.
  - *The Defense:* Enforce tenant-scoped database queries on every single read, update, and delete operation: `Report.findOne({ _id: reportId, workspaceId: currentUser.workspaceId })`. Never rely on unverified client-provided IDs.
- **API2: Broken Authentication:**
  - *The Vulnerability:* Weak token signing secrets, accepting unverified JWTs with `alg: "none"`, passing tokens in URL query strings (leaked in access logs), or failing to invalidate compromised tokens.
  - *The Defense:* Use asymmetric cryptographic keys (e.g., RS256/ES256) for JWTs, enforce strict expiration (`exp`) and audience (`aud`) validation in middleware, transmit tokens strictly in HTTP headers, and implement token revocation blocklists in Redis.
- **API3: Broken Object Property Level Authorization (Mass Assignment & Excessive Data Exposure):**
  - *The Vulnerability:*
    1. *Mass Assignment:* A client submits `{ "name": "Alice", "role": "admin", "verified": true }` to `PUT /api/profile`. The controller executes `User.update(req.body)`, allowing the client to overwrite internal privilege fields.
    2. *Excessive Data Exposure:* A controller executes `SELECT * FROM users` and returns the raw database record, inadvertently transmitting password hashes, two-factor secrets, and internal audit flags to the client.
  - *The Defense:* Use Data Transfer Objects (DTOs) with strict schema validation (e.g., Zod) that whitelist allowed input fields and strip unknown properties (`stripUnknown: true`). On the output layer, use explicit projection/serialization schemas that map only public properties to the JSON response.
- **API4: Unrestricted Resource Consumption:**
  - *The Vulnerability:* A client requests `GET /api/v1/transactions?limit=500000` or sends a 150MB nested JSON payload, causing memory exhaustion (OOM), garbage collection pauses, and database connection thread starvation.
  - *The Defense:* Enforce hard server-side pagination ceilings (`limit = Math.min(requestedLimit, 100)`), enforce maximum request payload size limits in body parsers (`express.json({ limit: '100kb' })`), set strict database query timeouts (e.g., 2000ms), and apply rate limits.
- **API5: Broken Function Level Authorization (BFLA):**
  - *The Vulnerability:* A regular user guesses administrative endpoints (e.g., `DELETE /api/v1/admin/users/12` or changing HTTP method from `GET /api/v1/users` to `DELETE /api/v1/users/12`) and the server only checks if the user is authenticated, not whether they hold the `ADMIN` role.
  - *The Defense:* Enforce Role-Based Access Control (RBAC) or Attribute-Based Access Control (ABAC) at the routing layer before the request reaches the controller logic. Never rely on the frontend UI to hide admin buttons.

## 4. Real Code — See It Working

Here is a complete, production-ready Node.js/TypeScript architecture illustrating secure API key verification, distributed Redis sliding-window rate limiting, hardened CORS governance, and BOLA/Mass-Assignment immune endpoint handlers.

**1. Cryptographic API Key Verification Middleware**

```typescript
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface AuthenticatedWorkspaceRequest extends Request {
  workspace?: {
    id: string;
    tier: 'free' | 'pro' | 'enterprise';
    scopes: string[];
  };
}

// In-memory mock database representing secure hashed storage
const API_KEY_DATABASE = new Map<string, {
  workspaceId: string;
  tier: 'free' | 'pro' | 'enterprise';
  scopes: string[];
  last4: string;
  revoked: boolean;
}>();

// Helper to generate a new key and return both plaintext (for client) and hash (for DB)
export function generateApiKey(workspaceId: string, tier: 'free' | 'pro' | 'enterprise', scopes: string[]) {
  // Generate 24 cryptographically secure random bytes
  const secretEntropy = crypto.randomBytes(24).toString('base64url');
  const plaintextKey = `sk_live_${secretEntropy}`;
  
  // SHA-256 hash computed immediately; plaintext is NEVER saved to disk or DB
  const keyHash = crypto.createHash('sha256').update(plaintextKey).digest('hex');
  
  API_KEY_DATABASE.set(keyHash, {
    workspaceId,
    tier,
    scopes,
    last4: plaintextKey.slice(-4),
    revoked: false,
  });

  return { plaintextKey, keyHash };
}

// Authentication middleware verifying the SHA-256 digest of incoming keys
export function requireApiKey(requiredScope?: string) {
  return (req: AuthenticatedWorkspaceRequest, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing or malformed Authorization header. Expected "Bearer sk_live_..."',
        },
      });
      return;
    }

    const rawKey = authHeader.replace('Bearer ', '').trim();

    // Verify expected structured prefix before running hash calculation
    if (!rawKey.startsWith('sk_live_') && !rawKey.startsWith('sk_test_')) {
      res.status(401).json({
        error: {
          code: 'INVALID_API_KEY_FORMAT',
          message: 'API key prefix is invalid. Must start with sk_live_ or sk_test_',
        },
      });
      return;
    }

    // Compute one-way hash of the incoming credential
    const incomingHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const record = API_KEY_DATABASE.get(incomingHash);

    if (!record || record.revoked) {
      res.status(401).json({
        error: {
          code: 'INVALID_API_KEY',
          message: 'The provided API key does not exist or has been revoked.',
        },
      });
      return;
    }

    // Enforce fine-grained scope authorization
    if (requiredScope && !record.scopes.includes(requiredScope) && !record.scopes.includes('*')) {
      res.status(403).json({
        error: {
          code: 'INSUFFICIENT_PERMISSIONS',
          message: `This API key lacks the required scope: "${requiredScope}".`,
        },
      });
      return;
    }

    // Attach verified identity context to the request pipeline
    req.workspace = {
      id: record.workspaceId,
      tier: record.tier,
      scopes: record.scopes,
    };

    next();
  };
}
```

**2. Distributed Sliding Window Rate Limiter using Redis**

```typescript
import { Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { AuthenticatedWorkspaceRequest } from './apiKeyMiddleware';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface RateLimitTierConfig {
  windowMs: number;
  maxRequests: number;
}

const TIER_LIMITS: Record<string, RateLimitTierConfig> = {
  free: { windowMs: 60_000, maxRequests: 60 },        // 60 req/min
  pro: { windowMs: 60_000, maxRequests: 600 },       // 600 req/min
  enterprise: { windowMs: 60_000, maxRequests: 5000 },// 5000 req/min
};

export function slidingWindowRateLimiter() {
  return async (req: AuthenticatedWorkspaceRequest, res: Response, next: NextFunction): Promise<void> => {
    // Identify client by workspace ID if authenticated, fallback to client IP for anonymous routes
    const identifier = req.workspace?.id || req.ip || 'anonymous';
    const tier = req.workspace?.tier || 'free';
    const config = TIER_LIMITS[tier];

    const key = `ratelimit:${identifier}:${req.baseUrl || 'root'}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    const memberId = `${now}:${crypto.randomBytes(4).toString('hex')}`;

    try {
      // Execute atomic Redis multi-command pipeline
      const pipeline = redis.pipeline();
      
      // 1. Purge requests outside the current sliding window
      pipeline.zremrangebyscore(key, 0, windowStart);
      
      // 2. Count remaining requests inside the sliding window
      pipeline.zcard(key);
      
      // 3. Add the current request timestamp to the sorted set
      pipeline.zadd(key, now, memberId);
      
      // 4. Ensure key expires automatically so idle sets are cleaned from memory
      pipeline.pexpire(key, config.windowMs);

      const results = await pipeline.exec();
      if (!results) {
        throw new Error('Redis pipeline execution failed');
      }

      // Extract result from zcard (2nd operation in pipeline)
      const requestCount = results[1][1] as number;
      const remaining = Math.max(0, config.maxRequests - requestCount - 1);
      const resetTimeSeconds = Math.ceil((now + config.windowMs) / 1000);

      // Populate standard client rate limiting headers
      res.setHeader('X-RateLimit-Limit', config.maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', resetTimeSeconds);

      // Check if client exceeded the quota
      if (requestCount >= config.maxRequests) {
        const retryAfterSeconds = Math.ceil(config.windowMs / 1000);
        res.setHeader('Retry-After', retryAfterSeconds);
        
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit of ${config.maxRequests} requests per minute exceeded.`,
            retryAfterSeconds,
          },
        });
        return;
      }

      next();
    } catch (err) {
      // Fail open or fail closed depending on SLA requirements (typically log and allow to avoid blocking traffic on cache failure)
      console.error('Rate limiting failure:', err);
      next();
    }
  };
}
```

**3. Hardened CORS Middleware with Whitelist Validation**

```typescript
import { Request, Response, NextFunction } from 'express';

const ALLOWED_ORIGINS = new Set([
  'https://app.yourdomain.com',
  'https://admin.yourdomain.com',
]);

export function secureCorsMiddleware(req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
    res.setHeader('Vary', 'Origin'); // Ensure intermediate CDNs cache responses per origin
  }

  // Handle preflight OPTIONS request immediately
  if (req.method === 'OPTIONS') {
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      res.status(403).json({ error: 'CORS origin not allowed' });
      return;
    }
    res.status(204).end();
    return;
  }

  next();
}
```

**4. OWASP-Hardened Route Handler: Preventing BOLA and Mass Assignment**

```typescript
import express, { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedWorkspaceRequest, requireApiKey } from './apiKeyMiddleware';
import { slidingWindowRateLimiter } from './rateLimiter';

const router = express.Router();

// Mock database repository
interface InvoiceRecord {
  id: string;
  workspaceId: string;
  amountCents: number;
  customerEmail: string;
  status: 'draft' | 'paid' | 'void';
  internalTaxAuditNote: string; // Sensitive internal property
  createdAt: Date;
}

const INVOICE_STORE = new Map<string, InvoiceRecord>();

// 1. Strict input validation DTO (prevents Mass Assignment)
const UpdateInvoiceSchema = z.object({
  amountCents: z.number().int().positive().optional(),
  customerEmail: z.string().email().optional(),
  status: z.enum(['draft', 'paid', 'void']).optional(),
}).strict(); // .strict() actively throws if unknown fields like "workspaceId" or "is_admin" are passed

// 2. Strict output projection DTO (prevents Excessive Data Exposure)
function serializeInvoiceResponse(invoice: InvoiceRecord) {
  return {
    id: invoice.id,
    amountCents: invoice.amountCents,
    customerEmail: invoice.customerEmail,
    status: invoice.status,
    createdAt: invoice.createdAt.toISOString(),
    // internalTaxAuditNote is intentionally omitted from the public representation
  };
}

// PATCH /api/v1/invoices/:id -> Fully secured against BOLA, Mass Assignment, and Unrestricted Consumption
router.patch(
  '/api/v1/invoices/:id',
  requireApiKey('invoices:write'),
  slidingWindowRateLimiter(),
  async (req: AuthenticatedWorkspaceRequest, res: Response): Promise<void> => {
    const invoiceId = req.params.id;
    const authenticatedWorkspaceId = req.workspace!.id;

    // Validate payload shape against schema
    const parseResult = UpdateInvoiceSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          details: parseResult.error.flatten().fieldErrors,
        },
      });
      return;
    }

    const updates = parseResult.data;

    // Defense against BOLA (OWASP API1): Scope query directly by workspaceId
    const existingInvoice = INVOICE_STORE.get(invoiceId);

    // Verify existence AND tenant ownership in a single logical check
    if (!existingInvoice || existingInvoice.workspaceId !== authenticatedWorkspaceId) {
      // Return 404 instead of 403 to prevent object ID enumeration probing
      res.status(404).json({
        error: {
          code: 'RESOURCE_NOT_FOUND',
          message: `Invoice with ID "${invoiceId}" was not found.`,
        },
      });
      return;
    }

    // Apply safe, whitelisted updates
    const updatedInvoice: InvoiceRecord = {
      ...existingInvoice,
      ...updates,
    };
    INVOICE_STORE.set(invoiceId, updatedInvoice);

    // Defense against Excessive Data Exposure (OWASP API3): Return projected DTO
    res.status(200).json({
      data: serializeInvoiceResponse(updatedInvoice),
    });
  }
);

export default router;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why should you never store API keys in plaintext in your database, and how do modern platforms like Stripe or GitHub securely handle key lifecycle and verification?**

Plaintext API keys stored in a database turn any database breach, backup leak, read-only replica vulnerability, or SQL injection into an immediate systemic compromise of all client integrations. Because API keys often grant high-privilege machine-to-machine access without two-factor authentication, an attacker with read access to the database can impersonate every customer indefinitely.

Modern platforms handle key lifecycle using a one-way cryptographic digest pattern:
1. **Generation:** The server generates a high-entropy random string with a descriptive prefix (e.g., `sk_live_...`).
2. **Display Once:** The plaintext key is returned to the user in the creation response and immediately discarded from memory. The server never writes the plaintext to disks, databases, or logs.
3. **Storage:** The server computes `hash = SHA256(plaintext_key)` and saves the hash alongside metadata (a non-sensitive display hint like the last 4 characters, owner ID, created timestamp, and assigned scopes).
4. **Verification:** On incoming requests, the server reads the `Authorization: Bearer <key>` header, calculates the `SHA256` hash of the provided string, and executes an indexed lookup (`SELECT * FROM api_keys WHERE key_hash = :hash`). If found and active, the request is authenticated. Even with a full database dump, an attacker cannot reverse `SHA-256` to discover the original API keys.

---

**Q: What is BOLA (Broken Object Level Authorization), why is it the #1 OWASP API vulnerability, and how do you systematically prevent it in a multi-tenant backend?**

BOLA (formerly known as IDOR — Insecure Direct Object Reference) occurs when an endpoint accepts a user-supplied resource identifier (such as an ID in the URL `/api/v1/orders/8842` or request body) and performs an operation on that resource without verifying that the authenticated client actually owns or has permission to access that specific object. It is the #1 vulnerability because modern APIs rely heavily on resource IDs in RESTful routes, and developers frequently assume that an authentication middleware (verifying *who* the user is) automatically handles authorization (verifying *what* the user is allowed to touch).

To systematically prevent BOLA:
1. **Tenant-Scoped Queries:** Never query records solely by their primary ID. Always bind the database query to the authenticated tenant/user context extracted from the verified session or token:
   ```sql
   -- VULNERABLE:
   SELECT * FROM documents WHERE id = :id;
   
   -- SECURE:
   SELECT * FROM documents WHERE id = :id AND workspace_id = :authenticated_workspace_id;
   ```
2. **Policy Enforcement / Guard Layer:** Use policy-based authorization libraries (such as CASL or Oso) or ORM interceptors that automatically inject ownership filters on all CRUD operations.
3. **Return 404 Instead of 403 on Unauthorized Probing:** If an object exists but belongs to another tenant, return `404 Not Found` rather than `403 Forbidden`. Returning 403 confirms to an attacker that the resource ID exists, facilitating systematic enumeration attacks.

---

**Q: How does a Sliding Window Log rate limiter work in Redis, and how does it compare to Token Bucket and Leaky Bucket in handling bursty traffic?**

A Sliding Window Log rate limiter tracks the exact timestamp of every request using a Redis Sorted Set (`ZSET`). For each incoming request:
1. It deletes all records in the set with timestamps older than `(currentTime - windowDuration)` using `ZREMRANGEBYSCORE`.
2. It counts the remaining elements in the set with `ZCARD`.
3. If the count is below the threshold, it adds the current timestamp via `ZADD` and permits the request; otherwise, it rejects with HTTP 429.

**Comparison:**
- **Sliding Window Log vs Fixed Window:** Fixed-window counters reset at rigid boundary intervals (e.g., at the turn of the minute), allowing double the limit to pass if a burst occurs across the boundary (50 requests at 10:00:59 and 50 requests at 10:01:01). The Sliding Window Log computes a rolling timeframe relative to the current millisecond, completely preventing boundary bursts.
- **Handling Bursts (vs Token Bucket & Leaky Bucket):**
  - *Token Bucket* explicitly allows controlled bursts up to its total capacity $B$. If a client is idle for an hour, it accumulates tokens and can execute an instantaneous burst before settling to the refill rate.
  - *Leaky Bucket* strictly forbids bursts, forcing all traffic into a constant, fixed outflow rate.
  - *Sliding Window Log* allows requests to arrive at any rate within the window as long as the cumulative count within any rolling $T$-second window does not exceed $N$.

The primary tradeoff of Sliding Window Log is memory consumption: storing a unique string member per request in Redis can consume substantial RAM under millions of requests per second. For ultra-high-throughput systems, a **Sliding Window Counter** (an approximation algorithm weighting the previous window count and current window count) or **Token Bucket** in Redis via Lua scripts is preferred.

---

**Q: Why is CORS often misunderstood as a server-side security boundary, and what are the exact risks of misconfiguring `Access-Control-Allow-Origin`?**

CORS is frequently misunderstood because developers assume that blocking an origin at the CORS layer prevents attackers from calling the API. In reality, CORS is entirely enforced by the **client's web browser**. Backend scripts (Python, Go, Node.js), cURL commands, mobile apps, and postman requests do not honor CORS policies and will receive server responses regardless of CORS headers. CORS exists solely to protect users by preventing untrusted web pages loaded in their browser from making unauthorized background requests to other services where the user is authenticated.

**Risks of Misconfiguration:**
1. **Wildcard `*` on Internal APIs:** If an API sets `Access-Control-Allow-Origin: *` on private endpoints, any website visited by an employee can issue requests to the API and read the responses.
2. **Dynamic Origin Echoing with Credentials:** Some developers attempt to support multiple domains by dynamically reading `req.headers.origin` and setting `Access-Control-Allow-Origin: ${req.headers.origin}` alongside `Access-Control-Allow-Credentials: true`. This completely disables the Same-Origin Policy: any attacker who lures a logged-in user to `https://malicious-site.com` can issue authenticated requests with the victim's session cookies and exfiltrate sensitive account data.

---

**Q: What is Mass Assignment (Broken Object Property Level Authorization), and how do DTOs and schema validators eliminate it?**

Mass assignment occurs when an API framework automatically binds untrusted client-supplied JSON input directly into internal backend data models or database ORM entities without filtering.

For example, if an update profile endpoint executes `User.update(req.body)`, a malicious user can send:
```json
{
  "displayName": "New Name",
  "isVerified": true,
  "role": "superadmin",
  "accountBalanceCents": 100000000
}
```
If the underlying ORM entity has matching column fields for `role` or `accountBalanceCents`, the database updates those columns, allowing immediate privilege escalation or financial fraud.

**Elimination via DTOs and Schema Validation:**
1. **Explicit Whitelisting:** Use Data Transfer Objects (DTOs) with strict schema validation libraries (such as Zod, Joi, or class-validator). Only explicitly declared fields are parsed and passed to the domain layer.
2. **Strict Mode Rejection:** Configure schema validators to strip or reject undeclared properties (`z.object({...}).strict()`), returning an HTTP 400 error when unauthorized fields are detected.
3. **Decouple API Models from Database Entities:** Never pass HTTP request payloads directly to ORM persistence methods (`prisma.user.update`, `mongoose.save`, or `TypeORM.save`). Construct the database update object explicitly property by property.

---

**Q: How do you design rate limiting for an API that serves both anonymous public users and high-volume authenticated enterprise tiers?**

A robust tier-aware rate limiter employs a multi-tiered keying strategy and dynamic limit lookup:

1. **Composite Key Construction:**
   - For authenticated requests: Key by `ratelimit:workspace:${workspaceId}:${endpointCategory}`.
   - For unauthenticated public routes (login, registration, forgot password): Key by `ratelimit:ip:${clientIp}:${endpointCategory}`.
2. **Dynamic Limit Resolution:** Store tier configurations in a fast memory cache or configuration map. Free tiers might be allocated 60 requests/minute, Pro tiers 600 requests/minute, and Enterprise tiers 5,000 requests/minute.
3. **Endpoint-Specific Multipliers:** Differentiate between cheap read operations and resource-heavy operations. An endpoint like `POST /api/v1/reports/export-pdf` should have a dedicated, stricter limit (e.g., 5 requests/minute) independent of the client's global request quota.
4. **Header Transparency:** Always return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset` on every response so enterprise clients can build automated backoff algorithms and preemptive pacing mechanisms before receiving a 429 response.

---

**Q: What headers and HTTP status codes must a secure public API return when rejecting malicious, unauthenticated, rate-limited, or unauthorized requests?**

A secure public API must provide standard, semantically accurate status codes while avoiding information leaks:

- **401 Unauthorized:** The client failed to provide valid authentication credentials (missing token, malformed key, expired JWT, or invalid signature). Must include a `WWW-Authenticate` header indicating the required scheme (e.g., `WWW-Authenticate: Bearer error="invalid_token"`).
- **403 Forbidden:** The client is authenticated, but their validated identity lacks sufficient permissions or scopes for the requested action (e.g., an API key with `invoices:read` scope attempting a `DELETE` request).
- **404 Not Found:** Used in place of 403 when accessing single resources in multi-tenant systems to prevent ID enumeration. If an attacker attempts `GET /api/documents/999` and that document belongs to another tenant, returning 404 prevents the attacker from confirming that document `999` exists.
- **400 Bad Request / 422 Unprocessable Content:** The input payload failed schema validation, contained undeclared fields, or violated data type constraints.
- **429 Too Many Requests:** The client exceeded their allotted rate limit. Must return `Retry-After: <seconds>`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, and `X-RateLimit-Reset`.
- **413 Content Too Large:** The incoming request body exceeded the server's maximum allowable payload limit (e.g., payload $> 100\text{KB}$).

## 6. The Traps — What Goes Wrong

**Trap 1: Relying on UUIDs / GUIDs as a Substitute for Authorization (Obscurity vs Security)**
- *The Wrong Assumption:* Developers often assume that switching from sequential integer IDs (`/invoices/104`) to UUIDv4 strings (`/invoices/8f3b9c71-2b4e-4f11-9a7c-9b881234abcd`) solves BOLA/IDOR because an attacker cannot easily guess the next UUID.
- *Why It Fails:* Obscurity is not authorization. UUIDs are frequently leaked in browser history, logs, referrer headers, client-side JavaScript bundles, and webhooks. The moment an attacker acquires a UUID, the lack of an object-level tenant check allows them to access the resource.
- *The Fix:* Always perform database-level ownership checks (`WHERE id = :id AND workspace_id = :authWorkspaceId`) regardless of whether the ID is an integer, UUID, or nanoid.

**Trap 2: Echoing the `Origin` Header to Bypass CORS Restrictions with Credentials**
- *The Wrong Assumption:* A developer wants multiple frontend staging environments to access the API with cookies enabled, but browsers block `Access-Control-Allow-Origin: *` when `Access-Control-Allow-Credentials: true`. The developer writes:
  ```javascript
  // DANGEROUS MISTAKE:
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  ```
- *Why It Fails:* This completely nullifies browser same-origin protection. Any malicious website can now make cross-origin requests with the victim's cookies and read confidential API responses.
- *The Fix:* Maintain an explicit array or `Set` of allowed domains. Only reflect the origin header if `ALLOWED_ORIGINS.has(req.headers.origin)` evaluates to true.

**Trap 3: In-Memory Rate Limiting in a Distributed Multi-Instance Deployment**
- *The Wrong Assumption:* Implementing a rate limiter using an in-memory JavaScript `Map` or Node.js process cache (e.g., storing IP counts in local process memory).
- *Why It Fails:* In production, your API runs across multiple load-balanced containers or serverless instances. A client submitting 100 requests per minute across 10 container instances effectively bypasses the limit, getting 1,000 requests per minute because traffic is round-robined across independent in-memory counters.
- *The Fix:* Use a centralized, low-latency distributed store like Redis with atomic operations (Lua scripts or Redis Pipelines) to synchronize counters across all compute instances.

**Trap 4: Missing Pagination Ceilings and Payload Limits (Resource Starvation)**
- *The Wrong Assumption:* Implementing pagination by accepting query parameters `?limit=10&page=1` without enforcing a strict server-side maximum limit constraint.
- *Why It Fails:* An attacker passes `?limit=1000000`. The server attempts to deserialize one million database rows into JavaScript objects, causing severe heap memory spikes, event loop starvation, garbage collection lockups, and database socket timeouts.
- *The Fix:* Hard-cap all pagination inputs at the server boundary:
  ```typescript
  const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 100);
  ```
  Additionally, enforce maximum JSON payload limits at the HTTP body parser layer (`express.json({ limit: '100kb' })`).

**Trap 5: Blind Database Model Serialization (Excessive Data Exposure)**
- *The Wrong Assumption:* Executing `res.json(userRecord)` directly on the database entity because the frontend currently only renders `name` and `avatarUrl`.
- *Why It Fails:* If a developer later adds internal database columns (e.g., `passwordHash`, `resetPasswordToken`, `stripeCustomerId`, `twoFactorSecret`), those sensitive fields are immediately serialized into the public JSON response, exposing them to anyone inspecting the network tab.
- *The Fix:* Always pass internal entities through an explicit response projection function or serialization DTO that explicitly constructs the returned object.

**Trap 6: Rate Limiting by Client IP Behind a Reverse Proxy Without Proxy Trust**
- *The Wrong Assumption:* Reading `req.ip` or `req.headers['x-forwarded-for']` directly without configuring Express `trust proxy` settings.
- *Why It Fails:* An attacker can spoof the `X-Forwarded-For` header by providing a fake IP in their initial request (`X-Forwarded-For: 1.2.3.4`). If the backend naively picks the first IP in the header, an attacker can bypass IP rate limiting by randomizing this header on every call. Alternatively, if `trust proxy` is disabled, `req.ip` will be the internal IP of your AWS ALB/Cloudflare proxy, causing all global users to share one rate limit counter and blocking innocent traffic.
- *The Fix:* Configure your web server with the exact number of upstream proxy hops (e.g., `app.set('trust proxy', 1)` for a single AWS ALB) so the framework extracts the true client IP from the trusted proxy layer.

## 7. Compare With Related Concepts

**Authentication Credentials: API Keys vs JWT vs OAuth 2.0 Access Tokens**

| Feature / Dimension | API Key (`sk_live_...`) | JSON Web Token (JWT) | OAuth 2.0 Access Token |
| :--- | :--- | :--- | :--- |
| **Primary Use Case** | Machine-to-machine, developer APIs, server SDKs | User sessions, microservice-to-microservice propagation | Delegated third-party access to user resources |
| **Statefulness** | Stateful (requires fast DB or Redis lookup) | Stateless (cryptographically self-contained) | Stateful or stateless depending on authorization server architecture |
| **Revocation Speed** | Instantaneous (update database flag or invalidate cache) | Difficult before expiration (requires distributed revocation blocklist) | Instantaneous via Token Introspection or revocation endpoint |
| **Lifecycle / Expiration** | Long-lived (manually rotated by developer) | Short-lived (typically 5–15 minutes with refresh tokens) | Short-lived (paired with refresh tokens) |
| **Storage Security** | Stored hashed (`SHA-256`) at rest | Stored in memory / secure HTTP-only cookies | Stored in secure backend session or memory |
| **Rule for When to Use** | Use for developer programmatic access and backend SDKs. | Use for stateless internal microservice auth and short-lived browser sessions. | Use when third-party applications need delegated permission to access user data. |

**OWASP Authorization Defenses: BOLA vs BFLA**

| Feature / Dimension | BOLA (Broken Object Level Authorization — API1) | BFLA (Broken Function Level Authorization — API5) |
| :--- | :--- | :--- |
| **What It Protects** | The specific **data object / record** (e.g., Invoice #102 vs Invoice #103) | The administrative **action / route** (e.g., `DELETE /api/users` vs `GET /api/users`) |
| **Where It Fails** | Inside the database query / controller logic (missing tenant ownership filter) | At the routing / middleware layer (missing role / permission check) |
| **Attacker Perspective** | *"I can read another customer's private invoice by changing the ID in the URL."* | *"I can delete another user's account by sending a DELETE request to an admin endpoint."* |
| **How to Fix** | Scope all database lookups to the tenant: `WHERE id = :id AND org_id = :orgId`. | Enforce RBAC/ABAC guards on route definitions before executing controllers. |

**Rate Limiting Algorithms: Token Bucket vs Leaky Bucket vs Sliding Window Log**

| Metric / Behavior | Token Bucket | Leaky Bucket | Sliding Window Log |
| :--- | :--- | :--- | :--- |
| **Burst Handling** | Permits controlled bursts up to bucket capacity $B$ | Forbids bursts; forces strictly constant outflow rate | Permits bursts up to window limit $N$ |
| **Memory Footprint** | Extremely low (stores counter + last updated timestamp) | Low (stores queue count + last drip timestamp) | High (stores every request timestamp in a Sorted Set) |
| **Boundary Spike Risk** | None | None | None |
| **Best Used For** | General-purpose public REST APIs (Stripe, GitHub style) | Egress rate limiting, queue dispatchers, protecting legacy databases | Strict compliance APIs requiring 100% boundary accuracy at moderate traffic |

**Defense Boundaries: CORS vs Content Security Policy (CSP) vs Web Application Firewall (WAF)**

| Layer / Mechanism | CORS | Content Security Policy (CSP) | Web Application Firewall (WAF) |
| :--- | :--- | :--- | :--- |
| **Enforcement Point** | Browser HTTP client | Browser rendering engine | Edge network / Reverse proxy (Cloudflare, AWS WAF) |
| **Core Purpose** | Restricts which web domains can read responses from your API | Restricts which scripts, styles, and assets a browser can load and run | Filters malicious HTTP requests (SQLi, XSS, DDoS) before hitting servers |
| **Protects Against cURL / Scripts?** | **No** (Browser only) | **No** (Browser only) | **Yes** (Inspects all network packets) |
| **One-Line Rule** | Use CORS to control cross-origin browser access. | Use CSP to protect web frontends against XSS injection. | Use a WAF to filter automated network threats and volumetric DDoS attacks. |

## 8. 🧠 The Memory Hook

Public API security relies on **The Three Pillars of Airlock Defense**:
1. **At the Gate:** Store API keys as **SHA-256 hashes**, rate-limit with a **Redis sliding window**, and whitelist **CORS origins explicitly**.
2. **At the Door:** Kill **BOLA** by scoping every database query to the authenticated tenant, never by naked ID alone.
3. **At the Counter:** Kill **Mass Assignment** and **Data Leaks** by strictly validating incoming DTOs and projecting outgoing responses.

