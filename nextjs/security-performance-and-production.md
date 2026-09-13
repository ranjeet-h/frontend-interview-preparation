# Security, Performance, and Production

## Security fundamentals

Keep secrets, database access, and authorization in server-only modules. Never
put sensitive tokens in `localStorage` merely for convenience: JavaScript
injected by an XSS vulnerability can read them. Prefer short-lived sessions or
tokens in appropriately protected cookies, rotate credentials, and validate
authorization on every sensitive mutation and data read.

Treat external JSON, query strings, cookies, headers, and form data as untrusted.
Validate them at the boundary. Escape or safely render user content, use CSRF
protection where the cookie/session design requires it, and avoid logging
credentials or personal data.

## Performance

Next.js can code-split route bundles, prefetch internal links, optimize images
with `next/image`, fonts with `next/font`, and scripts with `next/script`. These
features reduce common costs but do not replace measurement.

- Keep Client Component boundaries small.
- Remove unnecessary client-only imports and large dependencies.
- Use responsive image sizes and stable dimensions to avoid layout shift.
- Lazy-load below-the-fold or browser-only widgets with dynamic import.
- Parallelize independent data work and stream slow regions.
- Measure server latency, cache hit rate, JS transfer, hydration, and Core Web
  Vitals separately.

Use `dynamic(() => import(...), { ssr: false })` only for components that truly
cannot render on the server, such as a browser-only chart. It trades server
HTML and SEO for compatibility, so it is not a generic performance fix.

## Runtime and deployment

Node.js Runtime provides the broad Node API ecosystem. Edge Runtime can reduce
latency near users but has a smaller API surface and deployment constraints.
Choose based on dependencies, connection behavior, latency, and host support—not
because “Edge” sounds automatically faster.

`output: "standalone"` produces a self-contained deployment artifact useful for
small Docker images. A production container should install only required
dependencies, build with the correct public configuration, run as a non-root
user, and provide health/observability hooks. Static export is a different mode:
it has no Next.js server runtime, so server-only features and dynamic handlers
may not be available.

## Production architecture

For a large application, separate route composition, server data access, domain
logic, and reusable UI. Define ownership for authentication, caching,
revalidation, errors, and observability. For multi-tenancy, resolve the tenant
from a trusted host/session mapping, enforce tenant scope in every query, and
test cross-tenant denial—not just successful access.

Real-time updates generally need a separately considered transport such as SSE,
WebSockets, or polling. Serverless request handlers may not support long-lived
connections, so confirm the deployment model before choosing WebSockets.

## Interview answers

**How do you debug a slow page?** Reproduce with production-like data, separate
server TTFB from browser download/hydration, inspect waterfalls and bundle
composition, check cache behavior and database/API latency, then confirm the fix
with measurements.

**How do Server Components reduce JavaScript?** Their implementation stays on
the server and only the rendered result plus required client references cross to
the browser. Importing a large dependency from a Client Component can still
pull it into the client graph.

**How do you monitor production?** Capture structured server errors and request
latency, trace upstream calls, track Web Vitals and cache behavior, alert on
error-rate/latency regressions, and redact secrets and sensitive payloads.

**How do you handle millions of dynamic pages?** Avoid building every page,
use parameter-aware rendering and caching, define invalidation, paginate data,
and choose a storage/CDN strategy that matches traffic and freshness.

## Memory hook

Fast Next.js applications are mostly boundary discipline: less browser code,
fewer waterfalls, explicit cache rules, and server-side security checks.

