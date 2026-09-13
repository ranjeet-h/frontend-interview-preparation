# API Versioning: Strategies, Evolution, and Backward Compatibility

## 1. Why This Exists — The Problem First

Imagine you run the backend for an e-commerce platform. To clean up technical debt, you make three simple changes: you rename `user_name` to `username`, convert sequential integer IDs (`10423`) to UUID strings (`"9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d"`), and consolidate address lines into a nested `address` object. You test everything against the web frontend, deploy to production on Friday afternoon, and watch all web tests pass.

Ten minutes later, PagerDuty erupts. Hundreds of thousands of active mobile app users on iOS and Android are crashing immediately on launch with unhandled parsing exceptions (`TypeError: Cannot read properties of undefined`). 

Web frontends refresh their JavaScript bundles when users reload the page, but mobile applications, embedded devices, and third-party partner integrations run compiled code distributed across client devices you do not control. Users routinely ignore app updates for months or years, and enterprise partners freeze their integration code for quarters at a time. If your backend changes an existing response shape or validation rule without warning, those legacy clients break instantly, and you cannot force half a million users to update their apps simultaneously.

The inverse mistake is just as damaging: backend engineering teams so paralyzed by the fear of breaking older clients that they never clean up mistakes. They spawn `/v1/`, `/v2/`, `/v3/`, all the way to `/v14/`, copy-pasting entire controllers, duplicating business logic across fourteen files, and maintaining two dozen database adapters until the codebase collapses under its own weight. API versioning exists to resolve this exact dilemma: it provides a structured mechanism to evolve system capabilities and ship modern contracts without severing connections with older clients, paired with a disciplined deprecation lifecycle so legacy contracts can be retired safely.

## 2. The Analogy — Make It Obvious

Think of an API as an electrical wall outlet and client applications as appliances with power plugs.

When an electrical grid operator upgrades power standards from 120V two-prong outlets to 240V three-prong grounded sockets, they cannot kick down millions of residential doors and force every homeowner to discard their refrigerators, microwaves, and lamps overnight. If they suddenly pump 240V through a 120V socket without warning, every legacy appliance plugged into the wall will burn out.

Instead, the power system handles evolution through three deliberate mechanisms:

1. **Backward-compatible socket shapes (Non-breaking changes):** Modern outlets are physically designed with neutral slots that allow legacy two-prong plugs to fit securely into three-prong grounded sockets without any adapter.
2. **Dual sockets and step-down transformers (Active version coexistence):** During a transition period, buildings install dual-voltage receptacles or supply external adapters. The modern circuit powers high-draw appliances with new wiring, while the legacy circuit continues powering older appliances from the exact same central power plant.
3. **Advance notice and sunset dates (Deprecation lifecycle):** The utility authority announces years in advance that 110V sub-grids will be permanently disconnected on a specific calendar date, allowing appliance manufacturers and consumers to migrate gradually before the legacy circuit is shut off.

In software architecture, your API endpoint is that wall outlet. Versioning provides the dual circuits and adapter layers that let modern and legacy clients draw from the same core business engine without blowing a fuse.

## 3. How It Actually Works — The Full Explanation

API versioning is not merely changing a URL string. It is a contract governance architecture spanning data serialization, edge routing, HTTP semantics, caching tiers, and data store evolution.

**Breaking vs. Non-Breaking Changes & The Tolerant Reader Pattern**

Before deciding to create a new API version, you must determine whether a change actually breaks client contracts.

A change is **breaking** if it alters an existing contract such that an unmodified legacy client will fail at runtime. Breaking changes include:
- Removing an existing endpoint, query parameter, or response field.
- Renaming an existing field (e.g., `user_name` to `username`, or `createdAt` to `created_at`).
- Altering the data type of a field (e.g., changing an integer ID to a string UUID, or changing a single string to an array of strings).
- Adding a mandatory field to an existing request payload (clients sending the old payload will now receive a `400 Bad Request`).
- Tightening validation constraints on incoming data (e.g., reducing max string length from 100 to 50 characters, or rejecting previously allowed enum values).
- Changing HTTP response status codes for established outcomes (e.g., returning `404 Not Found` instead of an empty array `200 OK []`, or replacing `200 OK` with `204 No Content`).
- Modifying error response payload structures.

A change is **non-breaking (additive)** if an unmodified legacy client continues to operate successfully:
- Adding a brand-new, distinct endpoint (e.g., adding `POST /api/v1/users/export`).
- Adding an optional request parameter or optional request body field with a safe default.
- Adding a new field to an existing response payload, provided clients adhere to the **Tolerant Reader pattern**.

The **Tolerant Reader pattern** (rooted in Postel's Law: "Be conservative in what you do, be liberal in what you accept from others") dictates that robust client applications must extract only the fields they care about and silently ignore unrecognized properties in the payload. If a mobile app is built with a tolerant parser, adding `"middle_name": "Alexander"` to a user profile response will not crash the client, eliminating the need to spin up a new API version.

**The 4 Primary API Versioning Strategies**

When breaking changes are unavoidable, you must expose both contracts simultaneously using one of four strategies:

1. **URI Path Versioning (e.g., `/api/v1/users` vs. `/api/v2/users`):** The version identifier is embedded directly into the resource path. The routing layer matches on the URL path prefix and delegates to the appropriate versioned handler. This approach is highly explicit, easy to test directly in browsers and cURL, and simplifies routing rules at reverse proxies and load balancers. Crucially, it is naturally cache-friendly because CDNs (Cloudflare, CloudFront) treat `/api/v1/users` and `/api/v2/users` as completely unique cache keys by default. The primary tradeoff is that it technically violates pure REST principles (a URI should identify a unique resource entity, not its schema representation) and can lead to URL bloat.
2. **Custom Request Header (e.g., `X-API-Version: 2` or `Accept-Version: 2.0.0`):** The URL remains uniform (`/api/users`), and the client declares its target contract using a custom HTTP header. Middleware inspects incoming headers and routes the request internally to the matching controller. This keeps resource URIs clean and allows granular endpoint-by-endpoint targeting. However, it cannot be tested directly in a browser address bar, and intermediate caching tiers (CDNs and reverse proxies) do not partition cache entries by custom headers unless the origin explicitly sends a `Vary: X-API-Version` response header. Forgetting the `Vary` header causes CDNs to serve cached v2 responses to v1 clients, triggering catastrophic client outages.
3. **Content Negotiation / Accept Header (e.g., `Accept: application/vnd.company.v2+json`):** The client requests a specific representation format using standard HTTP content negotiation (RFC 2616 / RFC 7231) via custom vendor media types. The server evaluates the `Accept` header and selects the serializer matching the requested media type. This is the most semantically pure RESTful approach (HATEOAS-compliant) because it preserves canonical URIs and relies entirely on standard HTTP protocol negotiation. However, it is complex for client developers to construct and debug, requires strict `Vary: Accept` configurations on CDNs, and makes API documentation tools (Swagger/OpenAPI) more complex.
4. **Query Parameter (e.g., `/api/users?version=2` or `/api/users?v=2`):** The version is passed as an optional or required query parameter. The application framework inspects `req.query.version` and defaults to a fallback version if omitted. It is trivial to implement and simple to test in a browser. However, it mixes API routing parameters with data filtering, sorting, and pagination logic. Some CDN configurations strip query parameters for static caching, leading to accidental version collisions.

**Backend Code Architecture: Preventing Version Sprawl**

The biggest architectural mistake in API versioning is copy-pasting entire controllers or scattering `if (version === 2)` checks throughout database queries and domain logic. A resilient backend architecture isolates version differences strictly to the outermost boundary of the application (the serialization and adapter layer), keeping core domain services unified:

- **Routing Tier:** Matches incoming version identifiers (via URI, header, or query param) and passes the validated request to version-specific controllers.
- **Controller Tier:** Handles HTTP-specific validation and invokes the shared, version-agnostic Domain Service.
- **Core Domain / Service Tier:** Executes business rules, interacts with databases, and produces rich internal domain entities. This tier has zero awareness of HTTP versions.
- **Serializer / Transformer (View) Tier:** Converts the rich domain entity into the specific JSON schema required by that version. `UserV1Serializer` outputs `{ id: 10423, user_name: "jdoe" }`, while `UserV2Serializer` outputs `{ id: "9b1deb4d...", username: "jdoe", account: { ... } }`.

**The Deprecation and Sunset Lifecycle (RFC 8594)**

Maintaining legacy API versions indefinitely consumes infrastructure, complicates schema migrations, and bloats codebases. A production API deprecation process follows five distinct stages:

1. **Telemetry and Consumer Identification:** Before announcing deprecation, instrument your API gateway to record request volume, error rates, and client identities (`User-Agent`, API Key, OAuth Client ID) for every version. You cannot safely deprecate a version without knowing exactly who is still calling it.
2. **Standardized Deprecation Headers (RFC 8594):** Communicate deprecation directly through machine-readable HTTP headers on every legacy response: `Deprecation: @1762819200` (timestamp when the version became deprecated), `Sunset: Wed, 11 Nov 2026 00:00:00 GMT` (RFC 8594 header signaling the exact timestamp when the endpoint will be permanently decommissioned), and `Link: <https://api.example.com/docs/v1-migration>; rel="sunset"; type="text/html"` (URL pointing directly to the migration guide).
3. **Direct Developer Outreach:** Use telemetry logs to email engineering teams whose API keys continue to hit deprecated endpoints 90, 60, and 30 days prior to the sunset date.
4. **Scheduled Brownouts (Chaos Testing for API Retirement):** Weeks before the final sunset date, execute intentional "brownout" windows during low-traffic hours where legacy endpoints return `410 Gone` or `400 Bad Request` with deprecation details for 30–60 minutes. This forces dormant client teams to notice the pending shutdown before permanent decommission.
5. **Final Decommissioning:** On the sunset date, decommission the legacy handler and replace it with a permanent `410 Gone` HTTP response containing a JSON payload referencing the new API documentation.

## 4. Real Code — See It Working

Here is a complete, runnable Node.js/Express implementation demonstrating URI path versioning, custom header fallback, response transformation via serializers, and RFC 8594 `Sunset` and `Deprecation` headers.

```javascript
// server.js
const express = require('express');
const app = express();
app.use(express.json());

// ==========================================
// 1. MOCK DATABASE & UNIFIED DOMAIN SERVICE
// ==========================================
// The internal domain model always represents the modern, complete system state.
const usersDatabase = [
  {
    legacyId: 101,
    uuid: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    username: 'alex_dev',
    firstName: 'Alex',
    lastName: 'Rivera',
    email: 'alex@example.com',
    status: 'ACTIVE',
    createdAt: new Date('2024-01-15T08:30:00Z'),
  }
];

// Unified domain service: zero awareness of HTTP API versions
const UserService = {
  findUserById(id) {
    // Lookup by either legacy numeric ID or modern UUID
    return usersDatabase.find(u => u.legacyId === Number(id) || u.uuid === id) || null;
  }
};

// ==========================================
// 2. SERIALIZERS (VIEW / TRANSFORMER TIER)
// ==========================================
// Translates rich internal domain objects into version-specific client schemas

const UserV1Serializer = {
  serialize(user) {
    // V1 contract: numeric ID, flat 'user_name', combined 'full_name'
    return {
      id: user.legacyId,
      user_name: user.username,
      full_name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      is_active: user.status === 'ACTIVE'
    };
  }
};

const UserV2Serializer = {
  serialize(user) {
    // V2 contract: UUID, split names, ISO timestamps, structured account object
    return {
      id: user.uuid,
      username: user.username,
      profile: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email
      },
      account: {
        status: user.status,
        memberSince: user.createdAt.toISOString()
      }
    };
  }
};

// ==========================================
// 3. DEPRECATION & SUNSET MIDDLEWARE
// ==========================================
// Enforces RFC 8594 Sunset and Deprecation headers for legacy contracts
const v1DeprecationNotice = (req, res, next) => {
  const sunsetDate = 'Sun, 01 Nov 2026 00:00:00 GMT';
  
  // RFC 8594: Tells automated tools and developers when this endpoint dies
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', sunsetDate);
  res.setHeader(
    'Link',
    '<https://api.example.com/docs/migration/v1-to-v2>; rel="sunset"; type="text/html"'
  );
  
  // Instruct intermediate caches to partition responses by version headers if applicable
  res.setHeader('Vary', 'Accept, X-API-Version');
  next();
};

// ==========================================
// 4. VERSIONED CONTROLLERS & ROUTING
// ==========================================

// --- V1 Route Handler (Deprecated) ---
app.get('/api/v1/users/:id', v1DeprecationNotice, (req, res) => {
  const user = UserService.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Serialize to V1 contract
  const payload = UserV1Serializer.serialize(user);
  return res.status(200).json(payload);
});

// --- V2 Route Handler (Current Standard) ---
app.get('/api/v2/users/:id', (req, res) => {
  const user = UserService.findUserById(req.params.id);
  if (!user) {
    return res.status(404).json({
      error: {
        code: 'USER_NOT_FOUND',
        message: `No user found matching identifier: ${req.params.id}`
      }
    });
  }

  // Serialize to V2 contract
  const payload = UserV2Serializer.serialize(user);
  return res.status(200).json(payload);
});

// ==========================================
// 5. HEADER-BASED CONTENT NEGOTIATION ROUTER
// ==========================================
// Allows clients hitting /api/users to specify version via header:
// e.g. "X-API-Version: 1" or "Accept: application/vnd.myapi.v2+json"
app.get('/api/users/:id', (req, res) => {
  const headerVersion = req.headers['x-api-version'];
  const acceptHeader = req.headers['accept'] || '';

  // Crucial: tell downstream CDNs that response varies based on these headers
  res.setHeader('Vary', 'X-API-Version, Accept');

  if (headerVersion === '1' || acceptHeader.includes('vnd.myapi.v1+json')) {
    // Route internally to V1 logic with sunset headers
    v1DeprecationNotice(req, res, () => {
      const user = UserService.findUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      return res.status(200).json(UserV1Serializer.serialize(user));
    });
  } else {
    // Default to V2 modern contract
    const user = UserService.findUserById(req.params.id);
    if (!user) {
      return res.status(404).json({
        error: { code: 'USER_NOT_FOUND', message: 'User not found' }
      });
    }
    return res.status(200).json(UserV2Serializer.serialize(user));
  }
});

// Start server if executed directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`API Versioning demo listening on port ${PORT}`);
    console.log(`- V1 (Deprecated): http://localhost:${PORT}/api/v1/users/101`);
    console.log(`- V2 (Current):    http://localhost:${PORT}/api/v2/users/101`);
    console.log(`- Header routing:  http://localhost:${PORT}/api/users/101 (Set X-API-Version: 1)`);
  });
}

module.exports = app;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What constitutes a breaking change in an API, and how does the Tolerant Reader pattern mitigate client failures?**

A change is breaking whenever an existing client making a valid request receives a response it cannot parse or a failure it did not anticipate. Breaking changes include removing or renaming fields, altering data types (e.g., string to array), adding required fields to incoming requests, tightening validation limits, or restructuring error response formats. 

The Tolerant Reader pattern mitigates client breakages by designing consumer applications to be resilient to non-breaking, additive API evolutions. Instead of binding strictly to an exhaustive schema where unexpected keys trigger deserialization errors, a tolerant client parses only the exact subset of fields it requires to render its UI or execute its logic, silently ignoring any unrecognized keys. This allows backend teams to add new properties, metadata, and optional endpoints to an existing API version without forcing a version increment.

**Q: Compare the four major API versioning strategies (URI path, custom headers, content negotiation, query parameters). When would you pick each?**

1. **URI Path (`/api/v1/resource`):** Best for public developer platforms (Stripe, GitHub, Twilio) and high-traffic distributed architectures. It is unambiguous, easiest to inspect in logs and browsers, trivial to route at load balancers, and CDN cache-friendly out of the box. Choose this as the default industry standard.
2. **Custom Request Header (`X-API-Version: 2`):** Best when you require clean, permanent resource URIs and need to version individual endpoints independently without changing URL structures. Requires strict `Vary: X-API-Version` response headers to prevent CDN cache poisoning.
3. **Content Negotiation (`Accept: application/vnd.company.v2+json`):** Best for strict REST/HATEOAS compliance where a URI represents a conceptual entity and headers define its representation. Choose this if your organization mandates strict REST adherence, but be prepared for higher client integration complexity and intricate caching rules.
4. **Query Parameter (`/api/resource?v=2`):** Best for rapid internal prototyping, sandbox testing, or simple services with automatic version fallbacks. Avoid for mission-critical public APIs due to query-stripping CDN proxies and cluttering of data filtering semantics.

**Q: How do you architect a backend codebase to support multiple API versions without duplicating business logic or creating spaghetti `if/else` statements?**

You implement an **Adapter / Serializer Architecture** that confines version differences strictly to the HTTP boundary. The core domain layer (services, business calculations, database queries) remains completely unified and version-agnostic, operating exclusively on the latest internal data model. 

Incoming requests pass through versioned controllers that translate external request payloads into standard internal domain commands. When returning responses, the controller passes the rich domain entity to a dedicated Serializer (e.g., `UserV1Serializer` vs. `UserV2Serializer`). The serializer maps the internal entity to the specific JSON shape, field names, and data types expected by that version. This keeps business logic in one place while isolating contract formatting to lightweight, easily testable transformation classes.

**Q: How does API versioning interact with CDN caching and edge proxies like Cloudflare or CloudFront?**

CDNs cache HTTP responses based on a **Cache Key**, which by default is constructed from the HTTP method, hostname, and full URI path (including query string). 

With **URI Path Versioning**, CDNs naturally create distinct cache entries for `/api/v1/products` and `/api/v2/products` without any special configuration. However, with **Header Versioning** or **Content Negotiation**, the request URI is identical (`/api/products`). If a CDN caches a v2 response for `/api/products` and the origin server does not include a `Vary: X-API-Version` or `Vary: Accept` header, the CDN will serve the cached v2 payload to subsequent v1 clients, crashing legacy applications. The `Vary` header instructs the edge proxy to include the specified request headers in its cache key calculation.

**Q: How do you gracefully deprecate and decommission an API version in production without breaking external partners or mobile apps?**

A production deprecation lifecycle requires telemetry, standardized headers, proactive alerting, and chaos testing:
1. **Telemetry:** Log all inbound requests by version, client identity (`User-Agent`, API Key), and endpoint to identify active consumers.
2. **RFC 8594 Headers:** Return `Deprecation: true`, `Sunset: <date>`, and a `Link: <url>; rel="sunset"` header on every legacy response to provide machine-readable and human-readable shutdown timelines.
3. **Automated Notification:** Trigger scheduled notifications to developer contacts associated with API keys still hitting deprecated endpoints at 90, 60, and 30-day milestones.
4. **Scheduled Brownouts:** Conduct planned 30–60 minute brownout windows weeks before shutdown where legacy endpoints return `410 Gone`, verifying that client teams notice the deprecation before the permanent cutoff.
5. **Decommissioning:** Turn off legacy serializers and permanently respond with `410 Gone` containing migration links.

**Q: How do you handle database migrations when two different API versions (v1 and v2) must run concurrently against the exact same database?**

You apply the **Expand/Contract (Parallel Run) Pattern** at the database layer. You never execute a destructive, breaking database migration (like dropping a column or renaming a table) while legacy API versions are active. 

Instead, you first **Expand** the schema by adding the new column (e.g., adding `first_name` and `last_name` while keeping `full_name`). The application writes to both columns or uses a database trigger/migration job to keep them synchronized. V1 reads and writes the legacy column; V2 reads and writes the new columns. Once telemetry confirms that V1 traffic has dropped to zero and the endpoint is sunset, you execute the **Contract** phase by removing the legacy column from the database.

## 6. The Traps — What Goes Wrong

**Trap 1: Incrementing the API Version for Additive, Non-Breaking Changes**
- *The Mistake:* Creating `/api/v3/users` simply because you added a new optional `middle_name` field or a new `/export` endpoint.
- *Why It Fails:* It causes rapid version sprawl. Clients get fragmented across versions, documentation becomes bloated, and engineers must maintain multiple pipelines for changes that were completely backward-compatible.
- *The Fix:* Reserve new versions strictly for breaking contract modifications. Add new fields directly to the existing version and enforce the Tolerant Reader pattern across client development teams.

**Trap 2: Direct Database Coupling to the Latest Version**
- *The Mistake:* Renaming a database column from `phone_number` to `phone` in PostgreSQL and updating the ORM model directly, assuming the controller will handle it.
- *Why It Fails:* Legacy V1 endpoints querying the database will immediately throw runtime SQL exceptions (`column users.phone_number does not exist`), instantly taking down older mobile apps.
- *The Fix:* Decouple database entity structures from public API schemas. Use the Expand/Contract migration pattern and domain serializers so database models can satisfy legacy and modern field requirements simultaneously.

**Trap 3: Header Versioning Behind a CDN Without the `Vary` Header**
- *The Mistake:* Using `X-API-Version: 2` on uniform URLs (`/api/items`) while deploying behind Cloudflare or AWS CloudFront without emitting `Vary: X-API-Version`.
- *Why It Fails:* The first client requesting V2 causes the CDN to cache the V2 response under the key `/api/items`. When an older mobile client requests `/api/items` with `X-API-Version: 1`, the CDN serves the cached V2 payload, causing JSON decoding crashes on thousands of mobile devices.
- *The Fix:* Always attach `res.setHeader('Vary', 'X-API-Version, Accept')` on all version-sensitive responses, or use URI path versioning for public cached endpoints.

**Trap 4: Assuming Mobile Clients Can Be "Force-Updated"**
- *The Mistake:* Treating mobile app users like web browser users and assuming a 14-day deprecation notice is sufficient to decommission V1.
- *Why It Fails:* Mobile users frequently disable automatic app updates, travel internationally, or operate on legacy OS versions that cannot install newer app builds. Decommissioning an API version without telemetry verification results in an immediate spike in 1-star App Store reviews and permanent customer churn.
- *The Fix:* Build a forced-upgrade check into mobile app bootstrap logic (`/api/app-config` returning `min_supported_version`), track active client version distributions in analytics, and maintain legacy API versions until active traffic drops below acceptable thresholds (e.g., < 0.1%).

**Trap 5: Branching Version Logic Deep Inside Domain Services**
- *The Mistake:* Writing code like `if (req.version === 'v2') { calculateDiscountV2(); } else { calculateLegacyDiscount(); }` deep inside core billing calculation services.
- *Why It Fails:* Conditional version checks metastasize throughout the entire service layer, making business logic impossible to unit test, refactor, or reason about.
- *The Fix:* Keep core domain logic unified. If business calculations themselves must diverge, create distinct strategy classes at the application layer (`StandardDiscountStrategy` vs. `TieredDiscountStrategy`) and select the strategy in the controller before invoking the domain service.

## 7. Compare With Related Concepts

**API Versioning vs. Feature Flags**
- *The Difference:* API versioning manages long-term, public, contractual stability between independent client builds and server schemas. Feature flags manage dynamic, runtime execution paths (enabling or disabling specific features per user, percentage rollout, or geographic region) on the exact same API contract.
- *One-Line Rule:* Use API versioning when changing the payload contract structure; use feature flags when toggling business logic or rolling out functionality dynamically to a subset of users.

**API Versioning vs. Database Schema Evolution (Expand/Contract)**
- *The Difference:* API versioning manages the external public interface exposed over HTTP to external systems. Database schema evolution manages internal persistent data storage and must support multiple concurrent API versions simultaneously via phased non-destructive migrations.
- *One-Line Rule:* API versioning dictates what clients see; the Expand/Contract database pattern allows legacy and modern API versions to query the same database tables without data loss.

**REST API Versioning vs. GraphQL Schema Evolution**
- *The Difference:* REST API versioning typically versions entire endpoints or representations (`/v1/` vs `/v2/`) due to fixed response shapes. GraphQL exposes a single uniform endpoint (`/graphql`) where schemas evolve continuously through additive field additions and field-level `@deprecated(reason: "Use newField")` directives.
- *One-Line Rule:* Use REST API versioning when managing discrete resource contracts over HTTP; use GraphQL field deprecation when clients request specific custom field trees from a single evolving schema.

## 8. 🧠 The Memory Hook

An API version is a legal contract with compiled clients that cannot update in sync with your server: keep your core domain unified, isolate contract differences strictly to edge serializers, and never delete an old field until telemetry proves zero traffic has touched it past its Sunset date.
