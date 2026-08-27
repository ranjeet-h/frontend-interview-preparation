# How Will You Handle Multi-Tenant Data Isolation

## 1. The Real-World Problem — When You Actually Hit This

You ship a SaaS app. Acme Corp and Globex Inc both pay for it. They share the same backend and database. Everything looks fine for months. Then support gets a ticket from Acme: "Why do I see Globex's invoices in my dashboard?"

Someone forgot a `WHERE tenant_id = ?` on one query. One missing filter leaked another customer's data. That is a breach, not a bug. Legal gets involved. Customers threaten to leave. And the worst part is the system looked like it was working. No error, no crash — just the wrong rows coming back.

That is why multi-tenant isolation exists. It is not about making queries convenient. It is about making it impossible for one tenant to ever see, change, or affect another tenant's data — even when a developer makes a mistake.

An interviewer asks this to see if you treat isolation as a system-wide rule enforced at every layer, not as a filter you remember to add when you think of it.

## 2. The Analogy — Make the Mechanic Obvious

Think of an apartment building with locked doors.

The building is your platform. Each company that pays you is a tenant family renting an apartment. Every tenant stores their stuff inside their apartment — orders, invoices, users, files. The hallway, elevator, and front door are shared. But the apartments themselves are locked.

There are three ways to give tenants privacy, and each maps to a real isolation strategy:

Shared floor with labeled locks — row-level isolation. Everyone lives on the same floor in the same rooms, but every item has a name tag that says which apartment it belongs to. Every time you open a cabinet, you must check the tag. That tag is `tenant_id`. If you forget to check, you grab the wrong person's stuff. To fix that, the building installs automatic locks that refuse to open unless your key matches the tag. That is Row Level Security.

Separate floors per tenant — schema per tenant. Each tenant gets their own floor with the same room layout. You do not need a tag because you are already on the right floor. But the building has to maintain many identical floors.

Separate buildings per tenant — database per tenant. Each tenant gets their own entire building. Maximum privacy and blast radius separation, but you now run many buildings.

The hallway key is your auth token. Your job is to look at that key, figure out which apartment the request belongs to, and make every single database call, cache lookup, and background job respect that boundary without relying on anyone remembering to check.

## 3. The Full Explanation — How It Actually Works

Multi-tenant means one deployment serves many customers who must never see each other. Isolation is the set of guarantees that enforce that.

There are three main strategies. Most teams start with the first and move to the others only when they must.

Row-level isolation is the common starting point. You keep one set of tables and add a `tenant_id` column to every row that belongs to a tenant. Every query then has to filter by that column. It is cheap to run, simple to migrate, and easy to onboard new tenants. The trade-off is discipline. If any query misses the filter, data leaks. You also have the noisy neighbor problem — one big tenant can fill the shared tables and slow everyone else down.

This is why you pair row-level isolation with enforcement at two layers. At the app layer, middleware reads the tenant from the verified session or JWT and stores it in the request context. Every data access helper reads from that context, never from a query param the client sent. At the database layer, you turn on Row Level Security. In Postgres you enable RLS on the table and write a policy that says rows are only visible when `tenant_id` matches the session variable you set per request. Now even a raw query without the filter returns nothing outside the tenant. You also index properly. Every table that has `tenant_id` needs a composite index starting with `tenant_id`, like `(tenant_id, created_at)` or `(tenant_id, status)`. Without that, every query scans across all tenants and performance falls apart as the shared tables grow.

Schema per tenant puts each tenant in its own Postgres schema with the same table structures copied inside. Your app sets `search_path` to the tenant's schema at the start of the request, so queries do not need `WHERE tenant_id` at all. Isolation is stronger because a bug cannot accidentally cross-tenant without first switching schemas. The cost is operational. Migrations must run against every schema. Backups and restores are per schema. Cross-tenant analytics or admin queries become harder. You also have more metadata objects to manage.

Database per tenant gives each tenant their own database and connection. Isolation is the strongest. A query literally cannot touch another tenant's data because it is connected to a different database. You can also give large tenants their own performance characteristics, backups, and even regions. The cost is much higher. You run many databases, you need routing that maps tenant to connection string, you need to migrate many databases in order, and connection pooling becomes more complicated.

Enforcement matters more than the model you pick. Three rules make isolation reliable no matter which model you use. First, never trust a tenant id from the client body or URL. Derive it only from the authenticated identity. Second, make tenant context mandatory. If a function can query without a tenant, someone will call it without one. Pass the tenant through context or a scoped client that already has it bound. Third, make isolation testable. Your test suite must have a specific test that creates data for tenant A and tenant B and then proves tenant A cannot read tenant B's rows through any endpoint, job, or cache path.

Beyond tables, you must also isolate caches, queues, files, and searches. A Redis key must be `tenant:{id}:orders:list` not just `orders:list` or every tenant shares the same cache entry. A background job must carry tenant_id in its payload and re-establish context when it runs, or a nightly export will dump the wrong data. Object storage paths need `tenants/{tenant_id}/...` and a search index needs tenant as a mandatory filter that is applied at the query layer, not as an optional parameter.

Picking the right strategy comes down to scale and risk. Use row-level when you have many small tenants and want simple operations. Move to schema per tenant when you need stronger separation without running many databases, or when tenants need minor custom fields. Move to database per tenant when you have compliance needs, large tenants who need performance isolation, or when customers require physical data separation and per-tenant backups.

## 4. See It In Practice — Real Code or Queries

These examples use Postgres and Node/Express, but the ideas apply to any stack.

Row-level table with the right index:

```sql
-- Every tenant-owned table carries tenant_id
CREATE TABLE orders (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  status text NOT NULL,
  total_cents integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index starts with tenant_id so every tenant-scoped query is fast
CREATE INDEX idx_orders_tenant_created ON orders(tenant_id, created_at DESC);
CREATE INDEX idx_orders_tenant_status ON orders(tenant_id, status);
```

Postgres Row Level Security that blocks the classic missing-filter leak:

```sql
-- Turn on RLS - without a policy, no rows are visible
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- Policy: a row is visible only when tenant_id matches the session variable
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.current_tenant')::uuid);

-- Per-request, your backend sets this before any query:
-- SELECT set_config('app.current_tenant', '550e8400-...', true);
```

App middleware that makes tenant mandatory and binds a scoped database client:

```js
// Express middleware - derives tenant only from verified auth, never from client params
function tenantContext(req, res, next) {
  // req.user is already verified by auth middleware
  if (!req.user || !req.user.tenantId) {
    return res.status(401).json({ error: 'missing tenant' });
  }
  // store on context, not on a global
  req.tenantId = req.user.tenantId;
  next();
}

// Scoped query helper - callers cannot query orders without a tenant
async function listOrdersForTenant(pool, tenantId, { status, limit = 50 }) {
  // tenantId is required - no default, no optional
  if (!tenantId) throw new Error('tenantId is required');

  // set the RLS session variable for this connection
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);

    // app still sends WHERE tenant_id for index use and defense in depth
    const result = await client.query(
      `SELECT id, status, total_cents, created_at
       FROM orders
       WHERE tenant_id = $1 AND ($2::text IS NULL OR status = $2)
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, status || null, limit]
    );
    return result.rows;
  } finally {
    client.release();
  }
}
```

Cache and queue isolation:

```js
// Cache key always namespaced - prevents tenant A reading tenant B's cached list
function cacheKey(tenantId, resource) {
  return `tenant:${tenantId}:${resource}`;
}
await redis.get(cacheKey(req.tenantId, 'orders:list'));

// Job payload must carry tenant - worker re-establishes context
await queue.add('export-orders', {
  tenantId: req.tenantId,
  requestedBy: req.user.id,
});

// In the worker
queue.process('export-orders', async (job) => {
  const { tenantId } = job.data;
  if (!tenantId) throw new Error('job missing tenantId');
  // set RLS and run tenant-scoped query same as request path
});
```

Schema per tenant routing:

```sql
-- One schema per tenant with identical tables
CREATE SCHEMA tenant_acme;
CREATE TABLE tenant_acme.orders ( LIKE public.orders_template INCLUDING ALL );

-- Per request, set search_path so unqualified queries hit the right schema
-- SET search_path TO tenant_acme, public;
```

Database per tenant routing:

```js
// Map tenant to its database - connection is chosen before any query
const pools = {
  acme: new Pool({ connectionString: process.env.DB_ACME }),
  globex: new Pool({ connectionString: process.env.DB_GLOBEX }),
};

function poolForTenant(tenantId) {
  const pool = pools[tenantId];
  if (!pool) throw new Error(`no database for tenant ${tenantId}`);
  return pool;
}
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What does multi-tenant data isolation actually mean?**

It means one codebase and one deployment serve many customers, and the system guarantees no tenant can read or write another tenant's data. Isolation has to hold for HTTP requests, background jobs, cache lookups, file reads, and search queries. It is not a UI filter — it is a data access rule enforced at the application and database layers so a single missed filter cannot cause a breach.

**Q: How do you choose between row-level, schema per tenant, and database per tenant?**

Use row-level when you have many smaller tenants and want low cost and simple migrations. You accept that discipline and RLS are critical. Use schema per tenant when you want stronger isolation than a shared table but do not want to operate many databases, or when a few tenants need slightly different columns. Use database per tenant when you need the strongest isolation — separate backups, per-tenant compliance or region, and performance isolation for large tenants — and you are willing to pay for running and migrating many databases. Teams often use a hybrid: row-level for most tenants and a dedicated database for the few largest or regulated ones.

**Q: How do you make sure no query ever forgets `WHERE tenant_id`?**

You make it impossible to query without it. At the app layer, data access goes through a tenant-scoped helper that requires tenantId as a parameter and reads it from the verified request context, not from client input. At the database layer, you enable Row Level Security so any query without the correct session tenant returns zero rows. Then you prove it with a cross-tenant test that creates rows for two tenants and asserts each tenant can only see its own. Code review also helps — a linter or query helper that rejects any query on a tenant-owned table without `tenant_id` catches mistakes before they ship.

**Q: How do you handle indexes and performance across tenants?**

Every tenant-owned table should have composite indexes that start with `tenant_id`. That way the database can seek directly to one tenant's rows before sorting or filtering further. For example `(tenant_id, created_at DESC)` for feeds and `(tenant_id, status)` for filtered lists. Without tenant-first indexes, queries scan across all tenants and get slower as you add customers. You also need tenant-aware vacuum, partitioning, or archiving if one tenant grows much larger than others, or that tenant will dominate shared table I/O and cache.

**Q: What else besides database rows needs isolation?**

Everything that can store or return data. Redis keys must include tenantId or tenants share cache entries. Queue jobs must carry tenantId and workers must re-establish tenant context before querying. Object storage paths need a tenant prefix and signed URLs scoped to that tenant. Search indexes need tenant as a mandatory filter applied at the engine level. Even logs and metrics should tag tenantId so you can debug per tenant without mixing them.

**Q: How do you migrate tenants between isolation levels?**

You never flip a switch. You dual-write or backfill, then cut over per tenant. For example, moving from row-level to database per tenant: provision the new database, copy that tenant's rows with a background job, keep new writes going to both places during the window, verify row counts and checksums, then switch routing for that tenant and retire the old rows after a retention period. This is tenant by tenant, tested with a canary tenant first.

## 6. The Traps — What Goes Wrong in Production

Forgetting `WHERE tenant_id` on one query is the number one leak. It often hides in an admin endpoint, a search query, an export job, or a raw SQL report someone added quickly. The app looks normal. The query returns rows — just from the wrong tenant. RLS plus a dedicated cross-tenant test is the real fix, not hoping reviewers catch every missing filter.

Trusting a tenant id from the client is the next breach. If the frontend sends `?tenantId=other-tenant` and you use it directly, an attacker can just change the value. Always derive tenant from the verified session or token, and ignore any tenant value the client sends.

Building RLS but never enabling it gives false confidence. In Postgres, `CREATE POLICY` alone does nothing until you run `ENABLE ROW LEVEL SECURITY`. With `FORCE ROW LEVEL SECURITY` you also cover table owners. Forgetting this during setup means policies exist but never apply, so tests pass for owners and fail for real users.

Missing composite indexes is a performance trap. An index on `(created_at)` without `tenant_id` first does not help multi-tenant queries. Every request scans more data than needed and latency grows with total data across tenants, not just one tenant's data. The fix is tenant-first indexes and checking `EXPLAIN ANALYZE` for `Index Scan` starting with `tenant_id`.

Losing tenant context in background work leaks quietly. A job enqueued without tenantId wakes up with no way to know who it belongs to. It either crashes or runs against the wrong tenant. Always put tenantId in the job payload, log entry, and cache key, and re-set the RLS session variable at the start of the worker.

Reusing global cache keys or pool connections without resetting tenant state is another leak. If you set `app.current_tenant` on a pooled connection and return it without clearing, the next request on that connection inherits the previous tenant. Set the session variable at the start of every request and rely on `SET LOCAL` within a transaction or explicit reset on release.

## 7. Compare With Related Concepts

**Row-level vs schema per tenant vs database per tenant — when to use which?**

Row-level keeps all tenants in the same tables and filters by `tenant_id`. It is cheapest to run and easiest to query across tenants, but needs strict filtering on every access and shares performance characteristics. Schema per tenant puts each tenant's tables in their own schema and routes by `search_path`. Isolation is stronger and per-tenant customization is easier, but migrations must run N times and cross-tenant reporting needs extra work. Database per tenant gives each tenant its own database and connection. It has the strongest isolation, per-tenant backup and scaling, and natural compliance boundaries, but the highest operational cost and most complex routing and migration.

A simple rule: start with row-level plus RLS and tenant-first indexes. Move to schema when schema-level separation or per-tenant DDL matters. Move to database when tenants need real physical separation, independent restores, or noisy-neighbor performance isolation that shared tables cannot give.

**Multi-tenancy isolation vs RBAC / authorization**

Tenant isolation answers which customer's data you can touch. RBAC answers which actions you can do inside that customer's data. You need both. A tenant admin and a tenant viewer both pass tenant isolation, but the viewer should not be able to delete invoices. Check tenant first, then role.

**Shared table vs soft delete isolation**

Both use a filter, but `deleted_at IS NULL` is a convenience for undelete. `tenant_id = ?` is a security boundary. Treat them differently. A missed soft-delete filter shows an old row. A missed tenant filter shows another company's data. Only tenant isolation deserves RLS, mandatory context, and dedicated breach tests.

## 8. 🧠 The Memory Hook

Multi-tenancy is an apartment building with locked doors — your job is to make every query prove which apartment it has the key for, so forgetting a filter does not open someone else's door. Start with one building and tagged rows, enforce it with middleware plus RLS and tenant-first indexes, and only give tenants their own floor or building when the cost of sharing outweighs the cost of running more buildings.
