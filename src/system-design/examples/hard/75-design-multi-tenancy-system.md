# 75. Design Multi-Tenancy System

[← Hard examples](index.md)

**Why interviewers ask** — SaaS economics require shared infrastructure with tenant isolation — data, performance, and configuration.

**Core insight** — Isolation level is a spectrum: DB-per-tenant (max isolation, max cost) to shared schema with row-level security (max efficiency, noisy-neighbor risk).

**Architecture**

```txt
Request → tenant resolver (subdomain / JWT claim) → tenant context
        → app layer enforces tenant_id on every query
        → shared DB (RLS) | schema-per-tenant | DB-per-tenant
Resource quotas → per-tenant rate limits, compute caps
```

- **Shared schema + RLS** — `tenant_id` column on every table; DB policies enforce isolation.
- **Schema per tenant** — Migrations per tenant; moderate isolation.
- **DB per tenant** — Enterprise tier; full isolation, ops overhead scales with tenants.
- **Noisy neighbor** — Per-tenant CPU/memory quotas; dedicated pool for premium tier.

**Key decisions** — Start shared, offer dedicated for enterprise; tenant ID in every log line and trace span; never trust client-supplied tenant ID without auth.

**Scale & failure** — Connection pooling per tenant tier; shard large tenants to dedicated resources; tenant-specific backup/restore for compliance.

**Deep link** — [Multi-tenant SaaS backend](../../backend-designs/design-a-multi-tenant-saas-backend.md)

**Memory hook** — Tenant ID on everything — isolation is a column, a schema, or a whole database.
