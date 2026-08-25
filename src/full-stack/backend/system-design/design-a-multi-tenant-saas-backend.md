# Design a Multi-Tenant SaaS Backend

## 1. Understand the Problem First — Clarify Before Designing

Imagine launching a B2B SaaS platform. In month three, two production disasters strike simultaneously:

First, a junior engineer adds a new reporting endpoint and forgets to append `WHERE tenant_id = :tenant_id` to an aggregate SQL query. A mid-tier customer opens their dashboard and sees the confidential financial ledger, employee salaries, and customer lists of their largest market competitor. Instant P0 security breach, legal exposure, and emergency board meetings.

Second, on the first business day of the quarter, an enterprise customer initiates an automated bulk import of 8 million records. Their queries monopolize every available connection in the relational database connection pool and spike CPU utilization to 100%. Within two minutes, 15,000 other paying small-and-medium business (SMB) tenants experience total platform outages and cascading HTTP 500 errors.

Multi-tenancy is the architectural discipline of serving multiple distinct customers (tenants) from a single shared infrastructure estate while guaranteeing absolute data privacy, performance isolation, and cost efficiency.

Before sketching boxes on a whiteboard, a senior architect clarifies the boundaries with the interviewer:

- **Tenant Scale and Distribution:** How many total tenants do we anticipate (e.g., 50,000 SMB accounts vs. 100 Fortune 500 enterprises)? What does the traffic distribution look like? (Typically, the top 1% of enterprise tenants generate 80% of total system throughput).
- **Isolation and Compliance Boundaries:** Are we subject to strict regulatory frameworks such as HIPAA, SOC2 Type II, or PCI-DSS? Do enterprise customers mandate Customer-Managed Encryption Keys (CMEK), physical data isolation, or regional data sovereignty (such as EU GDPR mandates)?
- **Workload Profile:** Is the platform read-heavy (e.g., analytics dashboards) or write-heavy (e.g., IoT ingestion, event streaming)? Are background batch operations (CSV imports, billing runs) common?
- **Customization and Domain Routing:** Do tenants require dedicated custom domains (`app.customer.com`), custom branding, tenant-specific webhook configurations, or dynamic custom database schemas/fields?

---

## 2. The Core Insight — The Decision Everything Else Flows From

The central dilemma of multi-tenancy is the tension between **cost efficiency** and **blast-radius isolation**:
- A single shared system minimizes cloud infrastructure spend and simplifies operations, but maximizes the risk of data leaks and noisy neighbor outages.
- A fully isolated, dedicated deployment per customer provides pristine security and performance, but multiplies operational complexity and infrastructure costs by 1,000x.

```txt
┌─────────────────────────────────────────────────────────────────────────┐
│                           THE CORE INSIGHT                              │
│                                                                         │
│  Multi-tenancy is NOT merely adding a `tenant_id` column to a table.    │
│  It is an end-to-end context propagation and blast-radius contract.     │
│                                                                         │
│  1. Context Extraction: Identity is established at the network edge.    │
│  2. Defense-in-Depth Storage: Data isolation is enforced by database-   │
│     level security primitives (PostgreSQL RLS), not app code memory.    │
│  3. Multi-Dimensional Bulkheads: Compute, queues, and caches isolate    │
│     noisy neighbors before they exhaust shared resources.               │
└─────────────────────────────────────────────────────────────────────────┘
```

Application-level filtering (relying on developers to remember `WHERE tenant_id = ?` in every ORM call or SQL query) will eventually fail. True multi-tenant reliability requires establishing an ambient tenant context at the perimeter and passing it through the execution path down to the database session, where the database engine itself rejects unauthorized cross-tenant row access.

---

## 3. High-Level Architecture — Components and Why Each Exists

```txt
                              [Client Requests]
                 (custom-domain.com / acme.saas.com / API Keys)
                                      │
                                      ▼
                      [Edge / Anycast Load Balancer]
             - TLS Termination & SNI-based Custom Domain Routing
             - Ingress DDoS Protection
                                      │
                                      ▼
                             [API Gateway Tier]
    ┌─────────────────────────────────────────────────────────────────────┐
    │ 1. Tenant Resolver: Maps Host Header / JWT / API Key to Tenant ID   │
    │ 2. Tenant Context Injector: Stamps `X-Tenant-ID` & Tier on Request  │
    │ 3. Per-Tenant Rate Limiter: Redis Sliding Window (Fair-Share Quota) │
    └─────────────────────────────────────────────────────────────────────┘
                                      │
                   ┌──────────────────┴──────────────────┐
                   ▼                                     ▼
        [Enterprise Compute Pool]               [Shared SMB Compute Pool]
      - Dedicated Pods / Over-provisioned     - Autoscaled Multi-Tenant Pods
      - High CPU/Memory Quotas                - Shared Worker Threads
                   │                                     │
                   └──────────────────┬──────────────────┘
                                      ▼
                        [Application Service Layer]
      - Ambient Async Context (AsyncLocalStorage / Request-Scoped Context)
      - Dynamic Connection Router & Shard Directory
                                      │
        ┌─────────────────────────────┼─────────────────────────────┐
        ▼                             ▼                             ▼
  [Cache Tier]             [Asynchronous Queues]        [Tiered Database Layer]
- Namespaced Keys          - Priority Queues per Tier   - SMB: Shared DB + RLS
  `ten_{id}:{key}`         - Rate-Limited Consumers     - Enterprise: Dedicated DB
- Tenant Eviction Shields  - Bulkhead Workers           - `SET LOCAL app.current_tenant_id`
```

### Component Roles Across the Request Lifecycle

1. **Edge Load Balancer & Ingress Controller:** Handles TLS termination across wildcards (`*.saas.com`) and custom domains mapped via CNAME (`app.enterprise.com`). Identifies the tenant origin before the request hits the application servers.
2. **API Gateway & Auth Service:** Decodes authentication tokens (JWTs) or API keys. Resolves the verified `tenant_id`, customer subscription tier (`Free`, `Pro`, `Enterprise`), and active feature flags. Evaluates Redis-backed token bucket rate limiters per tenant.
3. **Compute Tier (Bulkhead Pools):** Stateless application nodes separated into dedicated worker pools for high-paying enterprise contracts and autoscaled shared worker pools for self-serve users. This prevents a traffic surge in the free tier from exhausting compute threads needed by enterprise customers.
4. **Ambient Context Layer:** Request middleware populates thread-local or asynchronous execution storage (`AsyncLocalStorage` in Node.js, `context.Context` in Go, `threading.local` in Python) so every downstream logger, cache call, and database query automatically receives the verified tenant identity.
5. **Data Access & Storage Tier:** Uses connection pooling proxies (e.g., PgBouncer, AWS RDS Proxy) and injects the active tenant ID into the database session context. Enforces PostgreSQL Row-Level Security (RLS) or routes queries to dedicated tenant databases.
6. **Tiered Background Queues:** Partitions message queues (RabbitMQ, Kafka, AWS SQS) into distinct priorities and rate-regulated worker groups so long-running batch jobs never delay interactive user events.

---

## 4. Key Technical Decisions — With Real Tradeoffs

### 1. Multi-Tenancy Data Isolation Models

The choice of database isolation model dictates operational cost, security posture, schema migration complexity, and scale limits:

| Metric / Attribute | Model 1: Shared DB, Shared Schema (Pool Model) | Model 2: Shared DB, Separate Schema (Bridge Model) | Model 3: Dedicated DB per Tenant (Silo Model) |
| :--- | :--- | :--- | :--- |
| **How It Works** | All tenants share the same tables; every row has a `tenant_id` column protected by DB Row-Level Security (RLS). | Single DB cluster; each tenant gets an isolated PostgreSQL schema (`tenant_acme.users`). | Each tenant has an independent database instance or cluster. |
| **Infrastructure Cost** | **Lowest.** Near 100% hardware utilization; shared buffer pools and connection pools. | **Moderate.** Shared database engine, but internal database catalog overhead grows with schemas. | **Highest.** Significant idle capacity; baseline cost per tenant for minimum instance sizing. |
| **Blast Radius & Noisy Neighbors** | High risk. A runaway query from one tenant can saturate shared IOPS and buffer pools. | Moderate risk. Storage engine locks and memory buffers remain shared. | **Zero risk.** Total physical compute, memory, and IOPS isolation. |
| **Schema Migration Complexity** | **Trivial.** Run one migration script once across the shared database. | **High.** Must iterate through thousands of schemas; schema catalog lock contention; slow DDL loops. | **Complex.** Orchestrated rolling deployments across hundreds or thousands of discrete database endpoints. |
| **Data Backup / Restore** | Difficult. Restoring a single tenant requires point-in-time recovery to a staging DB and manual row extraction. | Moderate. Can dump and restore a single PostgreSQL schema using `pg_dump -n schema_name`. | **Trivial.** Native snapshot, backup, and restore per customer database. |
| **Compliance & CMEK** | Hard. Data is co-mingled on disk; requires application-layer column encryption for CMEK. | Moderate. Data separated logically; shared underlying storage volumes. | **Ideal.** Enterprise-grade compliance; individual KMS encryption keys; strict data residency. |
| **Scaling Limit** | Limited by single database write IOPS and maximum table size (mitigated via database sharding). | Degrades past 2,000–3,000 schemas due to internal PostgreSQL system catalog (`pg_class`) memory pressure. | Scales horizontally to tens of thousands of tenants (limited only by orchestration overhead). |

#### The Recommended Strategy: The Tiered Hybrid Architecture
Do not force a single database model across the entire customer base.
- **SMB / Self-Serve / Free Tiers:** Place 99% of customers in a **Shared Database, Shared Schema** architecture backed by PostgreSQL Row-Level Security (RLS) to maximize hardware margins.
- **High-ACV Enterprise Tier:** Automatically provision or route enterprise accounts to a **Dedicated Database (Silo)** or dedicated compute/database shard. The application routing layer inspects the tenant metadata and dynamically directs traffic to the appropriate cluster.

---

### 2. Tenant Context Propagation Architecture

```txt
┌──────────────┐     1. Bearer JWT      ┌─────────────────┐
│ HTTP Request │ ─────────────────────> │ Auth Middleware │
└──────────────┘                        └─────────────────┘
                                                 │ 2. Extracts `tenant_id`
                                                 ▼
                                        ┌─────────────────┐
                                        │  Async Context  │ (Ambient storage
                                        │  Store (Node /  │  per async flow)
                                        │    Go / Py)     │
                                        └─────────────────┘
                                                 │
                   ┌─────────────────────────────┴─────────────────────────────┐
                   ▼                                                           ▼
       ┌───────────────────────┐                                   ┌───────────────────────┐
       │   Redis Cache Client  │                                   │ Database Transaction  │
       └───────────────────────┘                                   └───────────────────────┘
         Auto-prepends namespace:                                    Injects session variable:
         `tenant:{id}:orders:10`                                     `SET LOCAL app.current_tenant = :id`
```

Tenant context must be established once at the perimeter and passed invisibly through the stack without requiring engineers to manually pipe `tenantId` arguments through every business logic function.

---

## 5. Deep Dives — The Parts That Actually Matter

### Deep Dive 1: Bulletproof Isolation with PostgreSQL Row-Level Security (RLS)

PostgreSQL Row-Level Security allows database administrators to define security policies that restrict which rows are returned or modified based on the current session user or session variables.

#### 1. Database Schema and Policy Definition

```sql
-- 1. Create a table with the discriminator column
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create an index on tenant_id for high-performance index scans
CREATE INDEX idx_documents_tenant_id ON documents (tenant_id);

-- 3. Enable Row-Level Security on the table
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- 4. CRITICAL: Force RLS even for table owners/application connection roles
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

-- 5. Define the security policy using a custom session variable
CREATE POLICY tenant_isolation_policy ON documents
    AS RESTRICTIVE
    FOR ALL
    TO application_user
    USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''))
    WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), ''));
```

#### 2. Application-Level Database Session Management

When checking out a connection from the connection pool, wrap queries in a transaction and set the local session variable. Using `SET LOCAL` guarantees that the variable is automatically cleared when the transaction ends, preventing context leakage when the connection returns to the pool.

```typescript
import { Pool, PoolClient } from 'pg';
import { AsyncLocalStorage } from 'async_hooks';

interface TenantContext {
  tenantId: string;
  userId: string;
  tier: 'free' | 'pro' | 'enterprise';
}

export const tenantStorage = new AsyncLocalStorage<TenantContext>();
const dbPool = new Pool({ /* connection config */ });

export async function executeInTenantTransaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const context = tenantStorage.getStore();
  if (!context?.tenantId) {
    throw new Error('Security Violation: Execution attempted without verified tenant context.');
  }

  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');

    // Set transaction-scoped session variable.
    // 'true' as second parameter makes it local to current transaction (equivalent to SET LOCAL)
    await client.query(
      "SELECT set_config('app.current_tenant_id', $1, true)",
      [context.tenantId]
    );

    // Any query executed here is physically filtered by PostgreSQL RLS
    const result = await callback(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

### Deep Dive 2: Fair-Share Rate Limiting and Noisy Neighbor Mitigation

A noisy neighbor is a tenant whose resource consumption degrades performance for all other tenants sharing that infrastructure. Rate limiting in multi-tenant systems cannot be global or IP-based; it must be **tenant-aware and tier-weighted**.

#### Tier-Weighted Sliding Window Rate Limiting (Redis + Lua)

```lua
-- KEYS[1]: Rate limit key: "rate_limit:tenant:{tenant_id}"
-- ARGV[1]: Current UNIX timestamp in milliseconds
-- ARGV[2]: Window size in milliseconds (e.g., 60000 for 1 minute)
-- ARGV[3]: Maximum allowed requests for tenant tier

local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local max_limit = tonumber(ARGV[3])
local clear_before = now - window

-- 1. Remove expired timestamps outside the sliding window
redis.call('ZREMRANGEBYSCORE', key, 0, clear_before)

-- 2. Count requests remaining in the current window
local current_requests = redis.call('ZCARD', key)

if current_requests < max_limit then
    -- 3. Add current request timestamp
    redis.call('ZADD', key, now, now)
    -- 4. Set key TTL to expire after the window
    redis.call('PEXPIRE', key, window)
    return 1 -- Allowed
else
    return 0 -- Rejected (HTTP 429 Too Many Requests)
end
```

#### Noisy Neighbor Defense Matrix

```txt
┌───────────────────┬────────────────────────────────────────────────────────────────────────┐
│ Layer             │ Mitigation Mechanism                                                   │
├───────────────────┼────────────────────────────────────────────────────────────────────────┤
│ API Gateway       │ Dynamic Token Bucket per tenant tier; circuit breaker on tenant spikes.│
│ Application       │ CPU & Memory limits via Kubernetes resource quotas per tenant tier.    │
│ Background Worker │ Tier-separated queues (Dedicated Enterprise vs Shared Weighted SMB).   │
│ Database IOPS     │ Strict `statement_timeout` (e.g., 2000ms) to kill runaway queries.     │
│ Connection Pool   │ Max connection limits per tenant partition using PgBouncer pools.      │
└───────────────────┴────────────────────────────────────────────────────────────────────────┘
```

---

### Deep Dive 3: Tenant-Aware Caching and Cache Poisoning Prevention

A critical vulnerability in shared cache infrastructures is **Cross-Tenant Cache Poisoning** or **Cache Key Collisions**. If a query for User ID `101` is cached under the key `user:101`, Tenant B querying their User `101` will retrieve Tenant A's cached personal data.

#### The Safe Cache Architecture
1. **Enforce Deterministic Key Namespacing:** Every cache key must include the verified tenant ID: `tenant:{tenant_id}:{entity_type}:{entity_id}`.
2. **Tenant-Level Fast Invalidation (Epoch Versioning):** To invalidate an entire tenant's cached data instantly (e.g., upon role permissions update or tenant suspension), maintain a `tenant_version` counter in Redis:

```typescript
class TenantAwareCache {
  constructor(private redis: any) {}

  private async getTenantPrefix(tenantId: string): Promise<string> {
    // Fetch or initialize tenant cache generation version
    let version = await this.redis.get(`tenant_version:${tenantId}`);
    if (!version) {
      version = '1';
      await this.redis.set(`tenant_version:${tenantId}`, version);
    }
    return `ten_${tenantId}:v${version}`;
  }

  async get(tenantId: string, key: string): Promise<string | null> {
    const prefix = await this.getTenantPrefix(tenantId);
    return this.redis.get(`${prefix}:${key}`);
  }

  async set(tenantId: string, key: string, value: string, ttlSeconds: number): Promise<void> {
    const prefix = await this.getTenantPrefix(tenantId);
    await this.redis.set(`${prefix}:${key}`, value, 'EX', ttlSeconds);
  }

  // Instant O(1) flush of all cache keys for a single tenant
  async invalidateAllForTenant(tenantId: string): Promise<void> {
    await this.redis.incr(`tenant_version:${tenantId}`);
  }
}
```

---

## 6. Failure Modes and Resilience

### 1. Context Leaks via Connection Pool Reuse
- **The Failure:** When using thread/connection pooling, Connection #4 is checked out by Tenant A. The app runs `SET app.current_tenant_id = 'tenant_A'`. When the request finishes, the connection is returned to the pool without clearing the state. Next, Tenant B checks out Connection #4. If the app fails to re-set the session variable, Tenant B executes queries under Tenant A's security context.
- **The Fix:** Always use `SET LOCAL` within an explicit transaction block (`BEGIN ... SET LOCAL ... COMMIT`), or configure the connection pooler (such as PgBouncer in transaction pooling mode) to issue `DISCARD ALL` or `RESET ALL` upon connection checkout/checkin.

### 2. DDL Migration Deadlocks Across Shared Tables
- **The Failure:** Running an `ALTER TABLE orders ADD COLUMN status VARCHAR(32);` migration on a shared database with 200 million rows acquires an exclusive lock (`ACCESS EXCLUSIVE`). High-volume write traffic from active tenants piles up behind the lock, exhausting all available connection pool slots and causing an immediate global outage.
- **The Fix:** Enforce backward-compatible, expand/contract zero-downtime migrations:
  1. Add nullable columns without heavy locks.
  2. Use `CREATE INDEX CONCURRENTLY` to avoid read/write locks.
  3. Set a strict lock timeout before running DDL: `SET lock_timeout = '2s';`. If the lock cannot be acquired immediately, the migration aborts safely instead of queueing requests.

### 3. Tenant Offboarding & GDPR "Right to be Forgotten"
- **The Failure:** An enterprise customer churns and requests total data deletion under GDPR. Executing `DELETE FROM records WHERE tenant_id = 'churned_id'` across 60 relational tables causes massive table write lock contention, creates huge Write-Ahead Log (WAL) spikes, and leaves orphaned data in asynchronous search indexes (Elasticsearch) and cold S3 backups.
- **The Fix:**
  - **Crypto-Shredding:** Encrypt tenant-sensitive fields using a unique Per-Tenant Data Encryption Key (DEK) managed in AWS KMS or HashiCorp Vault. When the tenant requests deletion, destroy the tenant's DEK. All data stored in active tables, historical WAL logs, cold database snapshots, and data lakes becomes mathematically unrecoverable instantly ($O(1)$ GDPR compliance).
  - **Asynchronous Sweepers:** Mark the tenant record as `status = 'DELETED'` and execute batch deletions via background workers during off-peak hours using small, indexed chunk sizes (`DELETE FROM records WHERE id IN (SELECT id FROM records WHERE tenant_id = 'x' LIMIT 1000)`).

---

## 7. What Makes a Great Answer vs an Average One

```txt
┌───────────────────────────────────────┬───────────────────────────────────────┐
│ Average / Junior Answer               │ Senior Architect Answer               │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ "I will add a `tenant_id` column to   │ "Data isolation requires defense-in-  │
│ every table and write `WHERE          │ depth: ambient context injection,     │
│ tenant_id = :id` in our ORM queries." │ PostgreSQL Row-Level Security (RLS)   │
│                                       │ with `FORCE ROW LEVEL SECURITY`, and  │
│                                       │ strict session variable scoping."     │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Chooses a single database strategy    │ Designs a Tiered Hybrid Model: Shared │
│ (e.g., pure Shared DB or pure         │ DB + RLS for high-margin SMBs, with   │
│ Database-per-tenant) for all users.   │ dynamic routing to dedicated Silo DBs │
│                                       │ for high-ACV enterprise compliance.   │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Ignores noisy neighbors or suggests   │ Implements multi-dimensional          │
│ basic IP-based rate limiting.         │ bulkheads: Tier-weighted Redis token  │
│                                       │ buckets, compute worker pool sizing,  │
│                                       │ and aggressive DB statement timeouts. │
├───────────────────────────────────────┼───────────────────────────────────────┤
│ Treats caching as standard key-value  │ Designs deterministic namespace       │
│ storage (`cache.get(id)`).            │ hashing and epoch-based generational  │
│                                       │ versioning to eliminate cross-tenant  │
│                                       │ cache poisoning and enable O(1) flush.│
└───────────────────────────────────────┴───────────────────────────────────────┘
```

---

## 8. 🧠 The Memory Hook

> **Multi-tenancy is an apartment high-rise with smart keycards and dedicated circuit breakers:**
>
> Tenants share the concrete foundation and water pipes (**shared compute and database infrastructure**) to keep rent affordable, but every private apartment door is secured by biometric locks (**ambient context + database-level Row-Level Security**), and every unit has its own dedicated electrical fuse box (**tier-weighted rate limiters and compute bulkheads**) so one resident throwing a massive party cannot blow the power grid for the entire building.
