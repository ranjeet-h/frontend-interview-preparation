# How Will You Prevent One Tenant From Accessing Another Tenant's Data

## 1. The Real-World Problem — When You Actually Hit This

Your SaaS has been live for six months. Acme Corp and Globex Inc both use it. One morning support gets a ticket from Acme: "When I search invoices, I see Globex's invoices for a split second, then they disappear." You check the logs. No error. The query was `SELECT * FROM invoices WHERE status = 'paid' ORDER BY created_at DESC LIMIT 20`. It worked in development with one tenant. In production with two million rows from 400 tenants, it just returned the 20 most recent paid invoices across everyone.

Nobody hacked anything. A developer built a new `/api/invoices/search` endpoint, added a status filter, and forgot `AND tenant_id = $1`. Frontend passed `tenantId` from localStorage, but the backend never verified it against the JWT. An Acme user opened DevTools, changed `orgId` in the URL from `org_123` to `org_124`, and the API happily returned someone else's data because it trusted what the client sent.

This is not a rare bug. Every multi-tenant app hits this the moment a second real customer exists. The fix is not "remember to add tenant_id." It is a system that makes it impossible to forget.

## 2. The Analogy — Make the Mechanic Obvious

Think of a large apartment building where every tenant has their own apartment and their own storage lockers in the basement.

The building works like this:

The key card you get at the front desk is your JWT. It has your apartment number baked into it by the manager, and you cannot rewrite it yourself. The doorman at the lobby is your middleware. He does not ask you "which apartment are you from?" He reads your key card, checks that the manager actually signed it, and stamps your hand with that apartment number. From that moment, every room you enter checks the stamp on your hand, not what you say.

Every single item in the building has an apartment number written on it in permanent marker — that is the `tenant_id` column on every row. The basement lockers have a second lock that physically checks your hand stamp against the number on the box before the door will open. That second lock is Row Level Security in Postgres. Even if the doorman is distracted and lets you walk to the wrong floor, the locker itself will not open for you.

What does not work is putting all packages in a shared lobby pile and trusting people to only pick up their own because the labels are hard to guess. Sequential package numbers like `invoice_1001`, `invoice_1002` are easy to guess — that is an IDOR. And building a separate building for every tenant (database per tenant) is the safest isolation but you now have to maintain 400 buildings.

The core idea: the tenant identity must come from a verified card, travel with the request automatically, and be checked in two places — by the doorman and by the lock on the data itself.

## 3. The Full Explanation — How It Actually Works

Preventing cross-tenant access is not one trick. It is three layers stacked so that if one fails, the next still blocks the leak.

First, decide where tenant identity comes from. It must come from the server-verified JWT or session, never from a query param, header the client controls, or body field. When a user logs in, your auth service puts `tenant_id` and `user_id` into the JWT claims after checking the password or SSO. The backend verifies the JWT signature on every request. If the signature is valid, you can trust the `tenant_id` inside it. If you let the frontend send `?tenantId=org_124` and you use that value, any user can change it and become another tenant.

Second, put a single middleware at the top of your request chain that extracts that verified tenant and makes it impossible to handle a request without it. In Express that means a middleware that runs before any route, decodes the JWT, and attaches `req.tenantId`. In FastAPI it is a dependency that every protected route must declare. That middleware also rejects requests with no tenant or a malformed tenant. Background jobs, cron tasks, and queue consumers do not have a JWT, so they must carry the tenant explicitly when the job is enqueued and restore it when the job runs.

Third, make every data access tenant-scoped by default, and enforce it in the database as well as the app. In the app, no query should ever run without `tenant_id`. The safest way is to not let developers write raw queries without it. Use an ORM scope, a query helper, or a Postgres setting that injects it. Then add Row Level Security as the safety net. RLS is a Postgres feature where you tell the table "reject any row where the row's tenant does not match the current session's tenant, no matter what query was sent." Even if a developer forgets the `WHERE`, Postgres still blocks it.

That gives you defense in depth. Middleware ensures the request knows who it is. App-level scoping ensures normal code paths are correct. RLS ensures a forgotten filter does not become a data breach.

There are trade-offs in how you store tenant data. Shared tables with a `tenant_id` column on every row is the most common for SaaS up to thousands of tenants. It is cheap to operate, easy to query across tenants for admin analytics, but you must get every query, index, and cache right. Schema per tenant (one Postgres schema per customer) gives stronger separation and lets you migrate one tenant at a time, but migrations and connection pooling get harder and cross-tenant queries are painful. Database per tenant gives the strongest isolation and lets you place big tenants on bigger hardware, but operating hundreds of databases is expensive and you lose any easy way to run global queries. Most teams start with shared tables plus RLS and only split when regulation or noisy-neighbor performance forces it.

Isolation does not stop at the database. Caches must be keyed by tenant. `cache:invoice:123` is a leak waiting to happen. Use `cache:tenant:org_123:invoice:123`. Search indexes must have tenant as a mandatory filter. Logs and traces should include `tenant_id` on every line so you can detect a cross-tenant query in seconds, but they must not log full PII across tenants. Message queues must carry `tenant_id` in the job payload so a worker processing a webhook for Globex does not accidentally email Acme's data.

Finally, use real tenant checks, not obscurity. UUIDv4 IDs make guessing harder but they are not access control. Always check ownership after lookup: fetch the row, then verify `row.tenant_id === req.tenantId`, or better, make that check part of the query itself with `WHERE id = $1 AND tenant_id = $2`. If the check fails, return 404, not 403, so an attacker cannot probe which IDs exist in other tenants.

## 4. See It In Practice — Real Code or Queries

These examples show the full chain: verified JWT to middleware to scoped query to RLS as backup. The code looks like real production code, not a sketch.

The middleware that sets tenant from the verified JWT. Never read tenant from the URL.

```js
// middleware/tenant.js - Express
import jwt from 'jsonwebtoken';

export function requireTenant(req, res, next) {
  const header = req.headers.authorization; // "Bearer eyJ..."
  if (!header) return res.status(401).json({ error: 'missing token' });

  try {
    // verify checks the signature - client cannot forge this
    const payload = jwt.verify(header.replace('Bearer ', ''), process.env.JWT_SECRET);
    // payload was set at login: { userId, tenantId, role }
    if (!payload.tenantId) return res.status(401).json({ error: 'missing tenant claim' });

    req.tenantId = payload.tenantId;
    req.userId = payload.userId;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

// usage - tenant is now required for every route under /api
// app.use('/api', requireTenant, apiRouter);
```

The wrong way and the right way to query. The wrong way leaks even if the ID is a UUID.

```js
// ❌ WRONG - trusts client-supplied tenantId and forgets scoping on search
app.get('/api/invoices/:id', async (req, res) => {
  const invoice = await db.query('SELECT * FROM invoices WHERE id = $1', [req.params.id]);
  res.json(invoice.rows[0]);
});

// ✅ RIGHT - tenant comes only from verified JWT, and is part of the query
app.get('/api/invoices/:id', requireTenant, async (req, res) => {
  const { rows } = await db.query(
    'SELECT * FROM invoices WHERE id = $1 AND tenant_id = $2',
    [req.params.id, req.tenantId]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

// Search that was leaking in the story - fixed
app.get('/api/invoices/search', requireTenant, async (req, res) => {
  const { status } = req.query;
  const { rows } = await db.query(
    `SELECT * FROM invoices
     WHERE tenant_id = $1 AND status = $2
     ORDER BY created_at DESC LIMIT 20`,
    [req.tenantId, status]
  );
  res.json(rows);
});
```

Postgres Row Level Security as the safety net. Even if someone forgets the `AND tenant_id` above, this blocks the row.

```sql
-- 1. Every tenant table has tenant_id and an index that starts with tenant_id
ALTER TABLE invoices ADD COLUMN tenant_id text NOT NULL;
CREATE INDEX idx_invoices_tenant_created ON invoices (tenant_id, created_at DESC);

-- 2. Enable RLS - once enabled, no row is visible unless a policy allows it
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- 3. Policy: a row is visible only when its tenant_id matches the session variable
-- app.current_tenant is a custom setting we set per request
CREATE POLICY tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));

-- 4. Per-request, set the tenant from the verified JWT (do this on every connection/checkout)
-- In Node with pg:
-- await client.query("SELECT set_config('app.current_tenant', $1, true)", [req.tenantId]);
-- With true as third arg, it is local to the current transaction.

-- 5. Application role should NOT be superuser and should NOT have BYPASSRLS
-- GRANT SELECT, INSERT, UPDATE, DELETE ON invoices TO app_role;
```

Making it hard to forget. A helper that forces tenant on every query, and an ORM scope.

```js
// db/tenantDb.js - helper that enforces tenant
export function tenantQuery(client, tenantId, text, params) {
  if (!tenantId) throw new Error('tenantId is required for every query');
  return client.query(text, params);
}

// Sequelize / Prisma style - default scope
// Sequelize
// Invoice.addScope('tenant', (tenantId) => ({ where: { tenant_id: tenantId } }));
// await Invoice.scope({ method: ['tenant', req.tenantId] }).findAll({ where: { status } });

// Mongoose plugin that auto-adds tenant to every find
function tenantPlugin(schema) {
  schema.pre(/^find/, function () {
    const tenantId = this.getOptions().tenantId;
    if (!tenantId) throw new Error('tenantId required');
    this.where({ tenantId });
  });
}
```

FastAPI version of the same idea — tenant as a verified dependency, not a body field.

```python
# Python / FastAPI
from fastapi import Depends, HTTPException, Header
import jwt

def get_current_tenant(authorization: str = Header(...)) -> str:
    try:
        payload = jwt.decode(authorization.replace("Bearer ", ""), "JWT_SECRET", algorithms=["HS256"])
        tenant_id = payload.get("tenant_id")
        if not tenant_id:
            raise HTTPException(status_code=401, detail="missing tenant claim")
        return tenant_id
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="invalid token")

@app.get("/invoices/{invoice_id}")
def get_invoice(invoice_id: str, tenant_id: str = Depends(get_current_tenant), db=Depends(get_db)):
    row = db.execute(
        "SELECT * FROM invoices WHERE id = :id AND tenant_id = :tid",
        {"id": invoice_id, "tid": tenant_id}
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="not found")
    return row
```

Cache and queue must also be tenant-scoped.

```js
// Cache key that leaks vs one that does not
// ❌ await redis.get(`invoice:${id}`)
// ✅
await redis.get(`tenant:${req.tenantId}:invoice:${id}`);

// Queue job that keeps tenant context
await queue.add('sendInvoiceEmail', {
  tenantId: req.tenantId, // set at enqueue time from verified JWT
  invoiceId: id,
});
// worker
queue.process('sendInvoiceEmail', async (job) => {
  const { tenantId, invoiceId } = job.data;
  // set RLS session var here too before querying
  await client.query("SELECT set_config('app.current_tenant', $1, true)", [tenantId]);
  // then fetch with tenant_id = $2 as well
});
```

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you stop a user from just changing the tenant ID in the URL from `/orgs/123/invoices` to `/orgs/124/invoices`?**

You never take tenant identity from the URL, query string, or body. The tenant comes from the JWT that the server signed at login. Your middleware verifies the JWT signature, reads `tenantId` from inside it, and ignores what the URL says. If the route includes an org ID for pretty URLs, you compare it: if `req.params.orgId !== req.tenantId` you return 404. The URL is for readability. The JWT is the source of truth. Changing the URL does nothing because the check is against the verified claim.

**Q: If you already add `WHERE tenant_id = $1` to every query, why do you also need Row Level Security?**

Because people forget. One new endpoint, one raw SQL report, one admin script, one ORM `include` that joins without the tenant filter, and you have a leak. RLS is defense in depth. You create a policy on the table that says "no row leaves this table unless `tenant_id` matches `app.current_tenant`." You set `app.current_tenant` per request from the verified JWT. After that, even if a developer writes `SELECT * FROM invoices WHERE status = 'paid'`, Postgres itself returns only rows for that tenant. The app filter is the primary guard. RLS is the seatbelt that catches the mistake. It costs a small planning overhead and you must remember that superusers bypass RLS by default, so the app role must not have `BYPASSRLS`.

**Q: Should you use shared tables with a `tenant_id` column, separate schemas per tenant, or a separate database per tenant?**

For most SaaS products, shared tables with `tenant_id` wins up to thousands of tenants because it is simple to operate, cheap, and lets you run cross-tenant admin and analytics queries easily. You pay with discipline — every index should start with `tenant_id`, every query must scope, and noisy neighbors can contend. Schema per tenant gives stronger isolation, lets you migrate or backup one tenant at a time, and makes a missing tenant filter harder to write, but migrations must run across hundreds of schemas and connection pooling gets more complex. Database per tenant gives the strongest isolation, lets you put large tenants on dedicated hardware, and helps with regulatory needs like data residency, but you now run hundreds of databases, cross-tenant queries are gone, and operations cost is high. Choose shared plus RLS by default, move to schema or database per tenant only when isolation, compliance, or scale forces it.

**Q: How does tenant isolation affect caching, search, logs, and background jobs?**

Every shared system must be tenant-keyed. A Redis cache entry for `invoice:123` will be served to whoever asks next. Key it as `tenant:org_123:invoice:123` and set TTLs per tenant. If you use a CDN or HTTP cache, add `Vary` or a tenant segment to the cache key, otherwise one tenant's response gets served to another. Search indexes like Elasticsearch must have `tenant_id` as a mandatory filter on every query, ideally injected by a wrapper that refuses to search without it. Queue jobs must carry `tenantId` in the payload and the worker must set the RLS session variable before querying. Logs and traces should include `tenant_id` on every line for debugging, but must never log another tenant's PII when handling a cross-tenant admin request. If you miss any of these, the database can be perfectly isolated and you still leak through the cache.

**Q: How do you test that cross-tenant isolation actually works, and what do you monitor in production?**

You test it with negative tests that try to cross the boundary on purpose. Create two tenants with data, get a JWT for tenant A, and try to `GET /invoices/<id-from-tenant-B>` — assert 404. Try listing with no tenant filter via a raw query if you have a test helper that bypasses the ORM — assert RLS blocks it. Fuzz by iterating over every endpoint and stripping or swapping the tenant claim. Run a load test that interleaves requests from two tenants on pooled connections to catch a missing `SET LOCAL` that leaks tenant between checkouts. In production, monitor for queries that scan without `tenant_id` by logging slow queries and checking `pg_stat_statements`, alert on any 404 spike where a user repeatedly probes IDs outside their tenant, and add an audit log for every cross-tenant admin access. If you can, run a nightly job that counts rows per tenant and asserts no query ever returned rows for two tenants in one response.

## 6. The Traps — What Goes Wrong in Production

The most common leak is trusting what the client sends. A frontend sends `tenantId` from localStorage or the URL and the backend uses it directly in the query. That is not authentication. The client can change it to any value. The fix is one rule: tenant comes from the verified JWT only, and middleware sets it before any handler runs.

The second trap is the one forgotten query. You added `tenant_id` to 47 queries and missed the 48th — a search endpoint, a CSV export, or a `JOIN` that pulls related rows without re-checking tenant. A join like `SELECT * FROM invoices JOIN customers ON invoices.customer_id = customers.id WHERE invoices.id = $1` still needs `AND invoices.tenant_id = $2 AND customers.tenant_id = $2`. If you join without both sides, a valid invoice ID from tenant A could pull a customer name from tenant B. The prevention is a query helper or ORM scope that refuses to run without tenant, plus RLS as the database backup.

RLS itself has a trap. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` does nothing if you keep using a superuser role, because superusers and roles with `BYPASSRLS` ignore policies. Many teams enable RLS, test with `postgres` user, see rows still leaking, and think RLS is broken. Your app role must be a normal role without `BYPASSRLS`, and you must `GRANT` on the table after enabling RLS. Also, you must set the session variable on every connection checkout. With a pool, a connection returned to the pool still has the previous request's `app.current_tenant` unless you use `SET LOCAL` inside a transaction or reset it on release. A missing reset means the next request on that pooled connection silently queries as the previous tenant.

Caches are the quiet leak. You fix the database, ship it, and the old cache still holds `invoice:123` from tenant B that tenant A's request now reads. Always prefix cache keys with tenant, and flush or version cache entries when you enable tenant scoping. The same goes for search indexes — if Elasticsearch documents do not store `tenant_id` and every search does not filter by it, a global search returns everyone.

Background jobs lose context. A user triggers "export all invoices" which enqueues a job. The worker picks it up five minutes later with no HTTP request and no JWT. If the worker does not have `tenantId` in the job data and does not set it before querying, it may export all tenants. Every async path — queue, cron, webhook retry, websocket event — must explicitly propagate tenant.

Finally, do not leak existence. If a user from tenant A tries `GET /invoices/<id-from-tenant-B>` and you return 403 Forbidden, you just told them that ID exists in another tenant. Return 404. It reveals nothing and matches the behavior of a non-existent ID. Log the 403-level event internally for security monitoring, but show 404 to the caller.

## 7. Compare With Related Concepts

**Tenant isolation vs authentication.** Authentication asks "who is this user?" Tenant isolation asks "which customer's data is this user allowed to see, and can we prove every row belongs to that customer?" You can have perfect JWT authentication and still leak if you never check that the row's `tenant_id` matches the JWT's `tenant_id`. Authentication gives you identity. Tenant scoping enforces the boundary around that identity.

**App-level `WHERE tenant_id` vs Postgres RLS.** An app filter is a convention — fast, flexible, but one forgotten query breaks it. RLS is an enforcement — the database refuses to return a wrong row even if the app asks. Use both. App filter is your primary path and lets you index and reason about queries. RLS is the safety net that turns a forgotten filter from a breach into a silent empty result. The cost of RLS is a bit of setup per table, a session variable per request, and the need to test with a non-bypass role.

**Shared tables vs schema per tenant vs database per tenant.** Shared tables with `tenant_id` are cheapest and most flexible for querying across tenants, but require discipline on every query and careful indexing on `(tenant_id, ...)`. Schema per tenant gives you namespace isolation and per-tenant migrations but multiplies DDL work. Database per tenant gives hard isolation and lets you isolate noisy neighbors or meet residency rules but multiplies operational cost. Rule of thumb: shared plus RLS until regulation, performance isolation, or per-tenant backup needs force a split.

**Tenant isolation vs IDOR.** IDOR is the general bug where changing an ID in the URL gives you someone else's object, usually within one tenant. Broken tenant isolation is IDOR at the tenant boundary — changing a tenant or object ID gives you another customer's data. UUIDs help against IDOR guessing but fix neither. The real fix for both is the same: `WHERE id = $1 AND tenant_id = $2` from a verified claim, not from user input, and 404 on mismatch.

**Tenant isolation vs role-based access control (RBAC).** RBAC controls what a user can do inside their tenant — can an editor delete invoices? Tenant isolation controls which tenant's rows they can see at all. You need both checks on every request: first, is this row in your tenant? Second, does your role allow this action on it? Checking only RBAC without tenant means a valid admin in tenant A could act as admin on tenant B's data.

## 8. 🧠 The Memory Hook

Your key card says which apartment is yours, the doorman reads it, and every locker checks it — if any one of those checks is missing, packages end up in the wrong hands. Never trust what the tenant tells you, stamp every row with who owns it, and let the database lock enforce it even when the app forgets.
