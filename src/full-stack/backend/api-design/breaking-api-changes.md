# Managing Breaking API Changes: Deprecation Lifecycles, Brownout Testing, and Sunsetting Governance

## 1. Why This Exists — The Problem First

Imagine your team maintains a core payments API. Over two years, your data model evolves, so you design a clean, modern `/v2/payments` endpoint and decide to retire `/v1/charge`. You send three company-wide email blasts over six months, post an announcement on the developer portal, and write a thorough migration guide.

On midnight of the cutoff date, you shut down `/v1/charge`. 

Ten minutes later, all hell breaks loose. PagerDuty fires dozens of high-severity alerts. Over 150 enterprise B2B partners, three third-party accounting integrations, and legacy iOS apps in production suddenly drop all midnight recurring subscription runs. Customer support queues explode with angry executives demanding why their revenue collection halted.

Why did this happen despite six months of emails? Because passive communication fails in software engineering. Emails get routed to spam folders or stale mailing lists. Original developers switch companies. Legacy cron jobs run quietly in the background without anyone touching their codebase for years. Internal teams deprioritize migration tickets because the legacy API "still works fine today."

In distributed architectures and public platforms, changing an API contract is not just a code deployment—it is a human coordination problem. Without a structured deprecation lifecycle, active consumer telemetry, and intentional brownout testing, you face an impossible dilemma: either break critical production workflows for paying customers or stay trapped maintaining obsolete, insecure legacy code forever.

## 2. The Analogy — Make It Obvious

Think of deprecating an API like demolishing a heavily traveled, aging suspension bridge to replace it with a modern tunnel.

```txt
[ Old Bridge (v1 API) ]  ─────────► Hand out warning fliers at tollbooths (RFC Headers)
                                  ► Photograph license plates to identify drivers (Telemetry)
                                  ► Close bridge for 1 hour at 2 AM (Brownout 1)
                                  ► Close bridge for 24 hours on Sunday (Brownout 2)
                                  ► Permanently barricade with "Bridge Closed" (410 Gone)

[ New Tunnel (v2 API) ]  ─────────► Smooth, modern traffic flow
```

If city planners dynamite the old bridge on Monday morning without warning, cars drive off the cliff. That is an unmanaged breaking change.

Instead, responsible planners follow a strict sequence:
1. **Build the New Tunnel First:** Drivers have a working alternative before anything changes on the old route.
2. **Hand Out Fliers at the Tollbooth:** Every time a driver uses the old bridge, the toll collector hands them a notice stating the exact closure date and directions to the tunnel (HTTP `Deprecation` and `Sunset` headers).
3. **Track License Plates:** Cameras log every regular commuter still using the old bridge. Planners personally call the trucking companies and bus operators who haven't switched (telemetry-driven targeted outreach).
4. **Schedule Temporary Closures (Brownouts):** Two months before demolition, the city closes the old bridge for one hour in the dead of night. One month before, they close it for 24 hours. Commuters who ignored all fliers and calls suddenly encounter a temporary barricade, realize their route is closing, and update their navigation systems while the old bridge can still be reopened if an ambulance needs it.
5. **Permanent Demolition:** Once traffic on the old bridge drops to zero, the bridge is permanently dismantled. A permanent barricade with clear detour signs turns away any lingering stragglers (HTTP `410 Gone`).

## 3. How It Actually Works — The Full Explanation

Managing breaking changes requires understanding what breaks client contracts, implementing standard metadata headers, tracking consumers, executing scheduled brownouts, and retiring code cleanly.

### What Constitutes a Breaking Change

A breaking change is any modification that requires an existing client to change its code, configuration, or expectations to avoid runtime failure.

- **Structural Changes:** Renaming fields (e.g., `user_name` to `username`), deleting fields, changing field types (e.g., integer ID to UUID string), or rearranging JSON hierarchies (e.g., flattening an address object).
- **Semantic and Behavioral Changes:** Changing unit measurements (e.g., charging in dollars instead of cents), modifying default sorting orders, altering filter semantics, or changing pagination mechanics (e.g., switching from offset/limit to opaque cursor tokens).
- **Validation Tightening:** Making an optional request parameter required, lowering string maximum lengths, or enforcing stricter regex formats.
- **Protocol and Security Changes:** Changing authentication headers (e.g., moving from API keys to OAuth Bearer tokens), altering rate limit tiers downwards, or dropping supported HTTP methods.

Non-breaking changes, by contrast, are strictly additive: adding a new optional request parameter, adding a new field to a response body (assuming clients follow Postel's Law and use tolerant JSON parsers), or exposing a brand-new endpoint.

### The 5-Stage Deprecation Lifecycle

```txt
┌────────────────┐     ┌────────────────┐     ┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   1. ANNOUNCE  │ ──► │  2. SOFT DEPR  │ ──► │  3. TELEMETRY  │ ──► │  4. BROWNOUT   │ ──► │  5. HARD SUNSET │
│ Changelogs &   │     │ RFC 8594       │     │ Track Clients  │     │ Scheduled      │     │ 410 Gone       │
│ Migration Docs │     │ Sunset Headers │     │ by Consumer ID │     │ Error Windows  │     │ Route Deletion │
└────────────────┘     └────────────────┘     └────────────────┘     └────────────────┘     └────────────────┘
```

#### Stage 1: Announce and Document (T - 12 to 6 Months)
Release the new API version (`/v2/`) alongside the old one (`/v1/`). Publish migration documentation containing side-by-side payload examples, field mapping tables, and a published sunset timeline with specific milestone dates.

#### Stage 2: Soft Deprecation with Standard HTTP Headers (RFC 8594)
Do not break existing functionality. Instead, inject machine-readable standard deprecation headers into every response returned by deprecated endpoints:
- `Deprecation: @1735689600` (or `true`): Informs clients that the resource is officially deprecated. Unix timestamps indicate when deprecation started.
- `Sunset: Wed, 31 Dec 2026 23:59:59 GMT`: Informs automated agents and gateways of the exact moment the endpoint will be turned off.
- `Link: <https://api.example.com/docs/v2-migration>; rel="deprecation"; type="text/html"`: Provides a direct URI to human-readable migration instructions.

API gateways, automated contract monitors, and client SDKs inspect these headers to generate automated build warnings or alerts in downstream development environments.

#### Stage 3: Active Monitoring and Telemetry by Client ID
Every incoming API request must carry a traceable identity, such as an authenticated `client_id`, API key, or `User-Agent` header. 

Your API gateway logs metrics tagging every call to deprecated routes with:
- `client_id` / `account_id`
- `endpoint` and HTTP method
- `app_version` or SDK version
- Timestamp and request volume

Generate weekly burn-down charts showing traffic migration from v1 to v2 per account. Identify the top 20 enterprise consumers still generating traffic on v1 and initiate high-touch engineering outreach to their technical leads.

#### Stage 4: Brownout Testing (Forced Reality Checks)
Email notifications and headers only reach people who are looking for them. Brownout testing introduces intentional, temporary, artificial failures on deprecated endpoints during announced maintenance windows.

A standard brownout schedule looks like:
- **60 Days Before Sunset:** 1-hour brownout during low-traffic hours (e.g., Tuesday 02:00–03:00 UTC).
- **30 Days Before Sunset:** 4-hour brownout during business hours.
- **7 Days Before Sunset:** Full 24-hour brownout.

During a brownout window, the API gateway intercepts requests to legacy routes and immediately responds with `410 Gone` or `403 Forbidden` with a JSON payload explaining:
```json
{
  "error": "api_brownout_in_progress",
  "message": "This endpoint is deprecated and temporarily disabled for scheduled brownout testing.",
  "sunset_date": "2026-12-31T23:59:59Z",
  "migration_guide": "https://api.example.com/docs/v2-migration",
  "brownout_ends_at": "2026-11-01T04:00:00Z"
}
```

Brownouts trigger dormant alerts in consumer systems while the legacy API can still be instantly restored, forcing client engineering teams to prioritize migration tickets before the real deadline.

#### Stage 5: Hard Sunset and Permanent Tombstoning
When the sunset timestamp passes, remove the backend business logic, database queries, and background workers supporting the old endpoint. 

Replace the route with a permanent, lightweight edge handler returning `HTTP 410 Gone`. Unlike `404 Not Found` (which implies a mistyped URL or temporary routing glitch), `410 Gone` explicitly tells HTTP caches, search engine crawlers, and API clients that the resource intentionally no longer exists and will never return.

## 4. Real Code — See It Working

Here is a complete, production-grade Express middleware demonstrating RFC 8594 deprecation headers, client-level telemetry tracking, scheduled brownout window enforcement, and hard sunset responses.

```javascript
// deprecationMiddleware.js
import express from 'express';

/**
 * Configuration for a deprecated API endpoint
 */
const DEPRECATION_POLICIES = {
  '/api/v1/charge': {
    deprecatedSince: '2026-01-01T00:00:00Z',
    sunsetDate: new Date('2026-12-31T23:59:59Z'),
    migrationDocUrl: 'https://api.example.com/docs/v2-migration',
    replacementEndpoint: '/api/v2/payments',
    // Scheduled brownout test intervals
    brownoutWindows: [
      {
        start: new Date('2026-11-01T02:00:00Z'),
        end: new Date('2026-11-01T03:00:00Z'),
        reason: 'Phase 1: 1-hour brownout test'
      },
      {
        start: new Date('2026-12-01T14:00:00Z'),
        end: new Date('2026-12-01T18:00:00Z'),
        reason: 'Phase 2: 4-hour business-hours brownout test'
      }
    ]
  }
};

/**
 * Middleware handling RFC 8594 headers, telemetry, brownouts, and hard sunset
 */
export function handleDeprecation(req, res, next) {
  const path = req.baseUrl + req.path;
  const policy = DEPRECATION_POLICIES[path];

  // If endpoint is not under a deprecation policy, proceed normally
  if (!policy) {
    return next();
  }

  const now = new Date();
  const clientId = req.headers['x-client-id'] || req.headers['authorization'] || 'anonymous';

  // 1. Emit metrics/telemetry for monitoring dashboards
  console.log(`[DEPRECATION TELEMETRY] Path=${path} Client=${clientId} Time=${now.toISOString()}`);

  // 2. Check for Hard Sunset (Past the Sunset Date)
  if (now >= policy.sunsetDate) {
    res.set({
      'Sunset': policy.sunsetDate.toUTCString(),
      'Link': `<${policy.migrationDocUrl}>; rel="deprecation"; type="text/html"`
    });

    return res.status(410).json({
      error: 'endpoint_sunset',
      message: `This API version was permanently decommissioned on ${policy.sunsetDate.toISOString()}.`,
      migration_guide: policy.migrationDocUrl,
      replacement: policy.replacementEndpoint
    });
  }

  // 3. Check for Active Brownout Window
  const activeBrownout = policy.brownoutWindows.find(
    window => now >= window.start && now < window.end
  );

  if (activeBrownout) {
    res.set({
      'Sunset': policy.sunsetDate.toUTCString(),
      'Retry-After': Math.ceil((activeBrownout.end.getTime() - now.getTime()) / 1000).toString(),
      'Link': `<${policy.migrationDocUrl}>; rel="deprecation"; type="text/html"`
    });

    return res.status(410).json({
      error: 'scheduled_brownout_test',
      message: `This endpoint is temporarily offline for scheduled brownout testing.`,
      test_window: activeBrownout.reason,
      brownout_ends_at: activeBrownout.end.toISOString(),
      permanent_sunset_date: policy.sunsetDate.toISOString(),
      migration_guide: policy.migrationDocUrl
    });
  }

  // 4. Standard Soft Deprecation: Attach RFC 8594 Standard Headers
  res.set({
    'Deprecation': `@${Math.floor(new Date(policy.deprecatedSince).getTime() / 1000)}`,
    'Sunset': policy.sunsetDate.toUTCString(),
    'Link': `<${policy.migrationDocUrl}>; rel="deprecation"; type="text/html"`
  });

  next();
}
```

Here is how an internal backward-compatibility adapter translates legacy v1 requests into the modern v2 domain service, allowing backend architecture to evolve while maintaining legacy compatibility:

```javascript
// legacyAdapter.js
import express from 'express';
import { handleDeprecation } from './deprecationMiddleware.js';

const app = express();
app.use(express.json());

// Modern v2 domain service logic
async function processPaymentV2({ customerId, amountInCents, currency, idempotencyKey }) {
  // Production payment processing logic against modern data model
  return {
    paymentId: 'pay_' + Math.random().toString(36).substring(2, 9),
    status: 'succeeded',
    amount: amountInCents,
    currency
  };
}

// v1 Legacy Route: Translates flat legacy structure to modern domain model
app.post('/api/v1/charge', handleDeprecation, async (req, res) => {
  try {
    const { user_id, amount_dollars, curr } = req.body;

    // Adapt legacy payload into modern domain arguments
    const result = await processPaymentV2({
      customerId: user_id,
      amountInCents: Math.round(amount_dollars * 100),
      currency: curr || 'USD',
      idempotencyKey: req.headers['idempotency-key']
    });

    // Adapt modern result back to legacy response contract
    return res.status(200).json({
      charge_id: result.paymentId,
      status: result.status,
      charged_amount: amount_dollars
    });
  } catch (err) {
    return res.status(500).json({ error: 'charge_failed', message: err.message });
  }
});

// v2 Modern Route: Clean, validated endpoint
app.post('/api/v2/payments', async (req, res) => {
  const result = await processPaymentV2(req.body);
  return res.status(201).json(result);
});
```

And in client-facing TypeScript SDKs, use code-level deprecation annotations with runtime telemetry logs to warn client developers during their local build and test runs:

```typescript
// clientSdk.ts
export interface LegacyChargeParams {
  user_id: string;
  amount_dollars: number;
  curr?: string;
}

let hasLoggedDeprecationWarning = false;

/**
 * Creates a payment charge.
 * @deprecated Since v2.4.0. Will be removed in v3.0.0 (Dec 31, 2026). Use `payments.create()` instead.
 * See migration guide: https://api.example.com/docs/v2-migration
 */
export async function createCharge(params: LegacyChargeParams): Promise<any> {
  // Emit single runtime console warning per process to prevent log spam
  if (!hasLoggedDeprecationWarning && typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[SDK WARNING] `createCharge()` is deprecated and will be removed on 2026-12-31. Migrate to `payments.create()`.'
    );
    hasLoggedDeprecationWarning = true;
  }

  const response = await fetch('https://api.example.com/api/v1/charge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Client-Id': 'sdk-ts-v2.4' },
    body: JSON.stringify(params)
  });

  return response.json();
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is the exact difference between a breaking change and a non-breaking additive change?**

A change is non-breaking if and only if an existing, unmodified client continues to execute successfully without runtime errors or altered business logic. Adding a new optional request field or introducing an entirely new endpoint is non-breaking. 

A change is breaking if it violates existing client assumptions. This includes:
- Removing or renaming fields in responses or requests.
- Changing field types (e.g., string to array).
- Making optional fields mandatory.
- Changing status codes (e.g., returning `422` instead of `400`).
- Altering business logic semantics (e.g., changing currency denomination from whole units to cents, or altering pagination sort defaults).

Even if your backend compiles cleanly, if an existing integration fails to parse the response or gets rejected by validation, it is a breaking change.

**Q: Why are emails and documentation changelogs insufficient for deprecating public or enterprise APIs?**

Emails and documentation depend on human attention and up-to-date contact lists. In enterprise organizations, the engineer who integrated an API three years ago often has left the company or moved to another team. The registered contact email is frequently an unmonitored distribution list or spam folder. Furthermore, automated cron jobs and microservices run silently without anyone actively checking developer portals. 

Relying solely on passive notices leads to surprise outages on sunset day. A resilient deprecation strategy combines machine-readable headers (`Deprecation`, `Sunset`), client-identified telemetry to target active callers, and scheduled brownout tests to actively surface the breaking change before permanent decommissioning.

**Q: What are RFC 8594 `Deprecation` and `Sunset` headers, and how do clients and gateways use them?**

RFC 8594 defines standard HTTP response headers for deprecation communication:
- `Deprecation`: Sent with a boolean (`true`) or an `@<timestamp>` indicating the resource is deprecated and should no longer be used for new development.
- `Sunset`: Contains an HTTP-formatted date (e.g., `Sunset: Wed, 31 Dec 2026 23:59:59 GMT`) indicating the exact date and time when access to the resource will be permanently terminated.
- `Link`: Accompanies these headers with `rel="deprecation"` linking to human-readable migration guides.

API gateways (like Kong, Envoy, or Cloudflare) can inspect these headers to generate metric dashboards of deprecated endpoint usage. Client SDKs and developer tooling parse these headers during automated integration tests to fail CI builds or log warnings before code reaches production.

**Q: What is brownout testing, why is it necessary, and how do you structure the schedule?**

Brownout testing is the practice of intentionally shutting down a deprecated API endpoint for short, controlled, scheduled time windows prior to its permanent sunset date. It acts as an active alarm system for dormant consumers who ignored deprecation notices.

Because the brownout is temporary, it forces consumer engineering teams to investigate failed alerts and discover the impending sunset *while there is still time to migrate and while the legacy API can be immediately restored if critical business operations stall*.

A standard schedule starts 60 to 90 days before sunset with a 1-hour window during off-peak hours. 30 days before sunset, a 4-hour window occurs during standard business hours. 7 days before sunset, a 24-hour blackout occurs. Each brownout returns `HTTP 410 Gone` with a body detailing the maintenance window and sunset instructions.

**Q: Why should you return HTTP `410 Gone` instead of HTTP `404 Not Found` upon hard sunset?**

`HTTP 404 Not Found` implies that the server cannot find the requested resource at the moment, which often suggests a temporary typo in the URL, a broken link, or an unattached reverse proxy route. Clients and proxies often retry 404s or waste engineering hours checking for network misconfigurations.

`HTTP 410 Gone` explicitly declares that the target resource was intentionally removed, is permanently unavailable, and has no forwarding address. It instructs HTTP caches, automated indexers, and client applications to stop issuing requests to that URI immediately and remove it from their configurations.

**Q: How do you handle database migrations when supporting v1 and v2 APIs concurrently?**

You use the **Expand and Contract Pattern** (also called Parallel Run). You never rename or drop database columns in a single migration step while supporting legacy API versions.

1. **Expand:** Add the new column or table alongside the old one in your database schema.
2. **Dual-Write / Abstract:** Update application services to write to both the old and new structures, or use database triggers/views to keep them in sync. The v1 API reads and writes the legacy structure; the v2 API uses the new structure.
3. **Backfill:** Run a background script to migrate existing historical data from the old structure to the new structure.
4. **Contract:** Once all clients migrate to v2 and v1 is hard-sunsetted, update the codebase to write only to the new schema and safely drop the old database columns.

## 6. The Traps — What Goes Wrong

- **The "Optional to Required" Stealth Break:** Developers often assume that adding validation to an existing field is a minor improvement. Making an optional request parameter required immediately breaks all legacy clients that omitted that field. If a field must become mandatory, you must introduce a new API version or accept a default fallback on the server.
- **The Silent 404 Sunset Trap:** When sunsetting a route, simply deleting the route definition in Express or FastAPI causes the framework to return a generic `404 Not Found`. Client developers assume a reverse proxy or load balancer misconfiguration occurred, wasting hours debugging infrastructure rather than executing their API migration. Always return `410 Gone` with a descriptive error payload.
- **The Indefinite Legacy Maintenance Trap:** Teams avoid setting hard sunset deadlines because they fear breaking a partner's integration. As a result, the backend team spends 30% of their time patching bugs across four historical API versions and maintaining tangled database adapters. Without a leadership-backed sunset policy and enforced brownouts, technical debt compounds indefinitely.
- **Brownouts Without Telemetry or Emergency Overrides:** Running a brownout without client-level monitoring means you cannot see which enterprise accounts failed during the window. Furthermore, if a brownout disrupts a hospital system or payment settlement pipeline, you must have an immediate feature flag to abort the brownout window without redeploying code.
- **Relying on Client-Side JSON Resilience:** Assuming clients use tolerant parsers that ignore unexpected response fields is dangerous. Many mobile apps and strongly typed Java/C++ clients crash with deserialization errors when an unexpected field appears in a v1 payload. Never add unnecessary fields to legacy contracts without testing client parser behavior.

## 7. Compare With Related Concepts

- **Deprecation vs Sunsetting:** Deprecation is the formal announcement and transition phase where an API is marked obsolete but remains fully operational. Sunsetting (or retirement) is the final execution phase where the endpoint is permanently deactivated and returns `410 Gone`. Deprecation is the warning; sunsetting is the shutdown.
- **Brownout Testing vs Chaos Engineering:** Chaos Engineering (e.g., Chaos Monkey) randomly injects infrastructure failures (killing pods, adding network latency) to test automated system self-healing and redundancy. Brownout testing intentionally disrupts specific business API endpoints during pre-announced calendar windows to expose unmigrated human consumers.
- **URL Versioning (`/v1/`) vs Header Versioning (`Accept: application/vnd.company.v1+json`):** URL versioning is explicit, easily routed by API gateways and CDNs, and simple to test in browsers and cURL. Header versioning keeps clean URLs and strictly adheres to REST principles, but complicates edge caching, reverse proxy routing, and developer debugging.
- **Backward-Compatible Adapter Pattern vs Forked Codebases:** When creating v2, do not fork your entire codebase or maintain two independent application repositories. Use an adapter or anti-corruption layer in your API gateway or controller layer that translates legacy v1 inputs into modern v2 domain calls, keeping your core business logic unified.

## 8. 🧠 The Memory Hook

**Announce to inform, Headers to warn, Telemetry to find, Brownouts to force, and 410 to bury.**

If you never schedule a brownout, your clients will schedule one for you on sunset day.
