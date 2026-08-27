# API Versioning Design: URI Path, Header, Query Parameter, and Content Negotiation Strategies

## 1. Why This Exists — The Problem First

Imagine you rename a single field in your API response from `user_id` to `id`, or you split a string field `full_name` into two separate fields `first_name` and `last_name`. You test it locally, deploy it to production, and celebrate.

Ten seconds later, your customer support desk explodes: 500,000 mobile app users on iOS and Android—who have app version 1.4 installed on their phones and disabled auto-updates—experience instant, fatal runtime crashes on launch. You cannot force a mobile user to update their phone app. In enterprise B2B software, dozens of third-party enterprise integrations and automated billing cron jobs that power millions of dollars in revenue break without warning.

On the other end of the extreme, when engineering teams panic about breaking existing clients, they copy-paste their entire codebase into separate folders (`/v1`, `/v2`, `/v3`, ..., `/v12`). Six months later, a critical security vulnerability or tax calculation bug is patched in `/v12`, but accidentally missed in `/v1` through `/v11`.

API versioning exists because software requirements change, but distributed clients upgrade on their own schedule—or never. It is the architectural contract that allows your backend systems to evolve, refactor, and introduce modern features without breaking the legacy applications, mobile clients, and third-party integrations running in the wild.

## 2. The Analogy — Make It Obvious

Think of an international hotel modernizing its electrical power system.

The hotel's core power grid upgrades from an old 110V two-prong ungrounded circuit to a modern, high-efficiency 230V grounded system with surge protection (the evolving backend engine).

- **URI Path Versioning (`/api/v1/users` vs `/api/v2/users`)** is like building physically separate hotel wings: Wing 1 has rooms with dedicated two-prong 110V wall sockets, while Wing 2 has modern three-prong 230V sockets. Anyone walking down the hallway sees the sign on the door immediately, and the building engineers know exactly which circuit supplies each wing without checking guest luggage.
- **Custom Header Versioning (`API-Version: 2026-08-01`)** is like having identical-looking modern sockets in every room, but guests insert a small hotel-issued keycard or badge into the socket faceplate indicating their device's voltage requirements before power flows.
- **Content Negotiation / Accept Header Versioning (`Accept: application/vnd.hotel.v2+json`)** is like a diplomat presenting a formal passport and customs declaration to the concierge specifying the exact power protocol their diplomatic equipment accepts.
- **Query Parameter Versioning (`/api/users?v=2`)** is like sticking a yellow Post-it note onto your plug wire. It works for a quick test, but notes easily get lost, smudged, or ignored by automated room cleaners.
- **Stripe-Style Transformation Gates** are like intelligent micro-inverters built right behind the wall plate: the central power plant *always* generates modern 230V power, but if an inverter detects a guest with a 110V legacy keycard, it down-converts the voltage on the fly right at the boundary. The central generator never has to run legacy generators.

## 3. How It Actually Works — The Full Explanation

API versioning is not merely picking a URL scheme; it is a system-wide strategy encompassing routing, intermediate caching, data transformation, database evolution, and client communication.

**The Four Major Versioning Strategies**

**1. URI Path Versioning (e.g., `https://api.example.com/v1/users`)**
The version number is baked directly into the URL path.
- *How it works:* The API gateway or router inspects the path prefix (`/v1` vs `/v2`) and dispatches the request to the matching controller, handler module, or container cluster.
- *Caching behavior:* Flawless out-of-the-box CDN and proxy caching. Content Delivery Networks (Cloudflare, Fastly, Akamai) and browser caches use the full URI as the primary cache key. `/v1/users/42` and `/v2/users/42` are naturally stored as completely separate cache entries without special configuration.
- *Trade-offs:* It is explicit, visible, and simple to debug in a browser address bar. However, it technically violates strict REST principles (which state that a URI should identify a unique resource, not its schema representation), and updating versions requires clients to alter their configured base URLs.

**2. Custom Header Versioning (e.g., `X-API-Version: 2` or `API-Version: 2026-08-01`)**
The URL remains clean and resource-focused (`https://api.example.com/users`), while the version is passed via a custom HTTP request header.
- *How it works:* A routing middleware inspects incoming request headers. If absent, the server falls back to the client's account-pinned default version or the global default.
- *Caching behavior:* Complex. Because the URI is identical for both versions, intermediate CDNs will serve stale v1 responses to v2 clients unless the server sends the HTTP header `Vary: API-Version, X-API-Version`. CDNs must be explicitly configured to include these custom headers in their cache hash calculation.
- *Trade-offs:* Keeps URLs clean and supports customer-level date pinning (popularized by Stripe). However, developers cannot test endpoints simply by pasting URLs into a standard browser tab without specialized tools or browser extensions.

**3. Accept / Content Negotiation Versioning (e.g., `Accept: application/vnd.mycompany.v2+json`)**
Leverages the standard HTTP `Accept` header and vendor-specific MIME types (RFC 6838).
- *How it works:* The client requests a specific media type representation. The web framework matches the media type in its content negotiation layer and invokes the corresponding serializer.
- *Caching behavior:* Requires `Vary: Accept`. While HTTP proxies natively understand `Vary: Accept`, browsers and simple caching layers often strip or collapse media type parameters.
- *Trade-offs:* Considered the most semantically correct RESTful approach because URLs represent pure resources. However, it has the highest client barrier to entry—constructing vendor MIME strings in frontend fetch wrappers or mobile network layers is error-prone and difficult to explore interactively.

**4. Query Parameter Versioning (e.g., `https://api.example.com/users?version=2` or `?v=2`)**
The version is supplied as a standard query string parameter.
- *How it works:* The router or controller reads `req.query.version` and branches logic accordingly.
- *Caching behavior:* CDNs cache by full URL including query strings, but query parameter reordering or query-stripping edge rules can lead to cache pollution and cache fragmentation.
- *Trade-offs:* Very convenient for rapid prototyping and browser testing. However, it pollutes the query string namespace, mixing version metadata with actual data queries like pagination, filtering, and sorting.

**The Stripe Model: Date-Based Evolution with Transformation Gates**

The naive way teams handle multiple versions is copy-pasting controller code. When supporting dozens of versions over a decade, this leads to an unmaintainable codebase.

Stripe solved this with a centralized transformation gate pattern:
1. **Latest Core:** The entire internal backend application (database models, business logic, validation, and controllers) always executes exclusively on the newest, latest API version.
2. **Version Pinning:** Every API key is pinned to the release date when the developer created their account (e.g., `2024-03-15`). Clients can temporarily override this by passing the `Stripe-Version: 2026-08-01` header.
3. **Request Transformation (Upcasting):** If a client sends an older payload (e.g., version `2024-03-15`), incoming request middlewares run small, pure transformation functions in chronological order to upgrade the request body to the latest schema before it reaches the domain logic.
4. **Response Transformation (Downcasting):** When the core controller returns the latest modern response, response middlewares apply reverse changelog transformations step-by-step backwards in time until the response matches the exact schema expected by the client's pinned date.

This isolates backwards compatibility into small, unit-testable transformation diffs, completely eliminating duplicated business logic.

**Breaking vs Non-Breaking Changes**

Understanding what constitutes a breaking change prevents unnecessary version increments:

- **Non-Breaking (Safe to deploy without a new version):**
  - Adding a new optional request field or query parameter.
  - Adding a new field to a response body (assuming clients follow the Robustness Principle: ignore unknown JSON keys).
  - Adding a brand-new endpoint (`POST /api/v1/payments/refunds`).
  - Adding support for a new HTTP method on an existing route.

- **Breaking (Requires a version increment or transformation gate):**
  - Renaming or removing an existing request or response field.
  - Changing the data type of a field (e.g., changing an ID from an integer `1042` to a UUID string `"usr_98a7c2"`).
  - Adding new required fields or tightening validation constraints (e.g., reducing max string length from 255 to 50).
  - Modifying HTTP status codes for existing outcomes (e.g., changing a success response from `200 OK` with a body to `204 No Content`).
  - Changing authorization or scope requirements for existing operations.

**Deprecation and Sunset Lifecycle (RFC 8594)**

Deprecation is a managed grace period, not an instant shutoff. Standardized HTTP headers communicate this timeline directly to client machines:

1. **`Deprecation` Header:** Tells the client that the endpoint is marked for retirement. Can be a boolean or a date (`Deprecation: @1780000000` or `Deprecation: true`).
2. **`Sunset` Header (RFC 8594):** Communicates the exact future date and time when the endpoint will become permanently unavailable (e.g., `Sunset: Fri, 01 Jan 2027 00:00:00 GMT`).
3. **`Link` Header:** Provides a machine-readable and human-readable URL pointing to the migration guide (e.g., `Link: <https://api.example.com/docs/v2-migration>; rel="sunset"; type="text/html"`).
4. **Brownouts (Chaos Cutoffs):** During the final 30 days before the sunset date, operations intentionally return simulated errors or high latency during short 15-minute off-peak windows. This alerts engineering teams running unattended cron jobs and legacy background processes before the permanent cutoff.
5. **The Final Shutdown Status Code:** When the sunset date passes, the endpoint must return `410 Gone`, not `404 Not Found`. `410 Gone` explicitly tells automated clients and search indexes that the resource intentionally existed in the past but has been permanently purged and will not return.

## 4. Real Code — See It Working

Here is a complete, production-grade Node.js and TypeScript implementation demonstrating multi-strategy version resolution, Stripe-style response downcasting transformers, and RFC 8594 deprecation headers.

```typescript
import express, { Request, Response, NextFunction } from "express";

// --- 1. Version Resolution & Context Types ---

export type ApiVersion = "2024-01-01" | "2025-06-01" | "2026-08-01";
export const LATEST_VERSION: ApiVersion = "2026-08-01";
export const SUNSET_DATE_V2024 = new Date("2026-12-31T23:59:59Z");

// Extend Express Request to carry version metadata throughout the pipeline
declare global {
  namespace Express {
    interface Request {
      resolvedVersion: ApiVersion;
    }
  }
}

// Middleware resolving version from Header, Accept MIME, or Path prefix
export function resolveApiVersion(req: Request, res: Response, next: NextFunction): void {
  // Strategy A: Custom Header (e.g. Stripe-style 'API-Version')
  const headerVersion = req.header("API-Version") as ApiVersion | undefined;

  // Strategy B: Accept Header Content Negotiation (e.g. 'application/vnd.company.2025-06-01+json')
  const acceptHeader = req.header("Accept");
  const acceptMatch = acceptHeader?.match(/application\/vnd\.company\.(202\d-\d{2}-\d{2})\+json/);
  const acceptVersion = acceptMatch ? (acceptMatch[1] as ApiVersion) : undefined;

  // Resolve with fallback to default latest
  const resolved = headerVersion || acceptVersion || LATEST_VERSION;

  // Validate supported versions
  const supportedVersions: ApiVersion[] = ["2024-01-01", "2025-06-01", "2026-08-01"];
  if (!supportedVersions.includes(resolved)) {
    res.status(400).json({
      error: "invalid_api_version",
      message: `Version ${resolved} is not supported. Supported: ${supportedVersions.join(", ")}`,
    });
    return;
  }

  req.resolvedVersion = resolved;

  // Crucial for intermediate CDNs: ensure cache keys account for version headers
  res.setHeader("Vary", "API-Version, Accept");
  next();
}

// --- 2. Deprecation and Sunset Header Middleware (RFC 8594) ---

export function applyDeprecationHeaders(req: Request, res: Response, next: NextFunction): void {
  if (req.resolvedVersion === "2024-01-01") {
    const now = new Date();

    // If past sunset date, permanently refuse service with 410 Gone
    if (now > SUNSET_DATE_V2024) {
      res.status(410).json({
        error: "api_version_decommissioned",
        message: "API version 2024-01-01 was permanently retired on 2026-12-31. Please upgrade to 2026-08-01.",
        migration_guide: "https://api.example.com/docs/migrations/v2026",
      });
      return;
    }

    // Attach standard deprecation warnings
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", SUNSET_DATE_V2024.toUTCString());
    res.setHeader(
      "Link",
      '<https://api.example.com/docs/migrations/v2024>; rel="sunset"; type="text/html"'
    );
  }

  next();
}

// --- 3. Stripe-Style Transformation Pipeline ---

// The latest modern shape returned by core business logic (2026-08-01)
interface UserResponseVLatest {
  id: string;
  name: {
    first: string;
    last: string;
  };
  contact: {
    email: string;
    phoneE164: string;
  };
  tier: "standard" | "premium" | "enterprise";
}

// Step 1 Downcaster: Converts 2026-08-01 -> 2025-06-01 (Flat contact fields)
function downgradeTo2025_06_01(data: any): any {
  const { contact, ...rest } = data;
  return {
    ...rest,
    email: contact.email,
    phone_number: contact.phoneE164,
  };
}

// Step 2 Downcaster: Converts 2025-06-01 -> 2024-01-01 (Flat full name)
function downgradeTo2024_01_01(data: any): any {
  const { name, ...rest } = data;
  return {
    ...rest,
    full_name: `${name.first} ${name.last}`.trim(),
  };
}

// Downcast runner applying chronological reverse diffs
export function transformResponseForVersion(data: UserResponseVLatest, targetVersion: ApiVersion): any {
  if (targetVersion === "2026-08-01") {
    return data; // Latest version receives unmodified domain payload
  }

  let transformed = { ...data };

  if (targetVersion === "2025-06-01") {
    transformed = downgradeTo2025_06_01(transformed);
  } else if (targetVersion === "2024-01-01") {
    // Traverse down all successive layers
    transformed = downgradeTo2025_06_01(transformed);
    transformed = downgradeTo2024_01_01(transformed);
  }

  return transformed;
}

// --- 4. Express Server & Route Setup ---

const app = express();
app.use(express.json());
app.use(resolveApiVersion);
app.use(applyDeprecationHeaders);

// Core domain handler: Always written against the latest 2026-08-01 schema
app.get("/users/:id", (req: Request, res: Response) => {
  // Simulate database retrieval of modern entity
  const latestUserData: UserResponseVLatest = {
    id: req.params.id,
    name: {
      first: "Ada",
      last: "Lovelace",
    },
    contact: {
      email: "ada@example.com",
      phoneE164: "+15550192834",
    },
    tier: "enterprise",
  };

  // Run through transformation gate matching client's requested version
  const formattedResponse = transformResponseForVersion(latestUserData, req.resolvedVersion);

  res.json(formattedResponse);
});

export default app;
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Which API versioning strategy should you choose for a public-facing B2B API vs an internal microservice ecosystem?**

For a public-facing developer API with diverse consumers (mobile devices, third-party webhook receivers, curl scripts, browser SPAs), URI path versioning (`/v1/resource`) is the industry gold standard. It is explicit, prevents configuration errors, requires no special header setups in basic client libraries, and leverages standard CDN caching rules without risky `Vary` header omissions.

For internal microservice-to-microservice communication where you control both the client and server codebases, Custom Header versioning (`API-Version: 2026-08-01`) or gRPC Protocol Buffer field numbering is vastly superior. It preserves semantic URL cleanliness, allows per-service date-based compatibility pinning, and avoids breaking route structures across internal service meshes.

**Q: How does the Stripe versioning model work, and why is it superior to duplicating controllers for every version?**

In naive systems, creating a new API version means duplicating controllers and models into `/v1` and `/v2` folders. Over several years and 20 versions, you end up with 20 copies of business logic, database queries, and authorization checks. Bug fixes or security patches applied to `/v20` are frequently forgotten in older versions.

The Stripe model eliminates duplication by requiring the internal backend services and database models to run strictly on the single, latest version of the API. Backwards compatibility is managed exclusively at the network edge using transformation gates. Incoming legacy requests pass through pure functions that upcast the payload to the latest format. The core engine processes the request once. The response then passes through reverse downcast transformation functions that format the response to match the legacy client's expectation. If a bug is fixed in the core logic, all versions instantly receive the fix.

**Q: What is the exact difference between a breaking change and a non-breaking change?**

A change is non-breaking if an existing client—built against the old documentation and without any code changes—continues to function completely without error. Examples include adding a new optional request field, adding a brand-new endpoint, or adding a new field to a response body (assuming clients follow standard JSON parsing rules).

A change is breaking if existing client code fails, crashes, or produces corrupted data without modifying their implementation. This includes deleting or renaming a field, changing a data type (e.g., string to array), changing field nullability, adding required input parameters, changing HTTP status codes for existing outcomes, or changing error response structures.

**Q: How do you prevent CDN cache poisoning when using Header or Accept versioning?**

When the URI is identical across multiple versions (e.g., `GET /api/users`), a Content Delivery Network will treat all requests to that URL as identical cache keys by default. If a v1 client requests `/api/users`, the CDN caches the v1 JSON payload. A subsequent v2 client requesting `/api/users` with `API-Version: 2` will receive the cached v1 response, causing silent data corruption and client crashes.

To prevent this:
1. The origin server must emit the header `Vary: API-Version, Accept` on every response.
2. The CDN caching policy must be explicitly configured to append the values of `API-Version` and `Accept` to its primary cache key hash calculation.
3. If public unversioned requests are allowed, the CDN must have a rewrite rule that assigns the global default version header before checking the cache store.

**Q: How do you handle database migrations when multiple API versions require different data structures?**

You must use the **Expand and Contract** (Parallel Run) database migration pattern:
1. **Expand:** Add new columns or tables to the database without deleting or renaming existing columns. Make new columns nullable or provide default values.
2. **Dual-Write / Sync:** Update your application layer to write to both the old and new columns simultaneously during the transition period.
3. **Backfill:** Run background asynchronous migration scripts to populate historical rows from old columns to new columns.
4. **Transition Handlers:** Point v1 handlers to read old columns (or use downcasting transformers) and v2 handlers to read new columns.
5. **Contract:** Only after all older API versions relying on the old columns have reached their `Sunset` date and returned `410 Gone`, run a final database migration to drop the obsolete columns.

**Q: What are API Brownouts and why are they used before sunsetting an API?**

An API Brownout is an intentional, temporary failure window introduced prior to the final decommission date of an API version. For example, 30 days before sunset, the engineering team intentionally returns `410 Gone` or `503 Service Unavailable` for 15 minutes during a scheduled maintenance window.

Brownouts exist because passive communication (emails, documentation banners, `Sunset` headers) is often ignored by client teams whose systems are running automated, unattended background jobs. When the service fails briefly during the brownout, automated alert systems wake on-call engineers at the client company, forcing them to upgrade before the permanent, irreversible shutdown.

## 6. The Traps — What Goes Wrong

**Trap 1: The Cascading Controller Fork (Copy-Paste Sprawl)**
- *The Mistake:* Copying entire controller files, service classes, and data access layers when creating `/v2`.
- *Why It Fails:* Over time, business logic drifts. A critical validation rule, fraud check, or tax calculation updated in v2 remains unpatched in v1. Attackers actively probe `/v1` endpoints to exploit known vulnerabilities that were fixed only in newer versions.
- *The Fix:* Keep the domain and service layers unified. Treat versioning as a boundary transformation concern using adapter middlewares or upcasting/downcasting pipelines.

**Trap 2: Destructive Database Column Drops While v1 Is Live**
- *The Mistake:* Running a database migration that renames `telephone` to `phone_number` because "v2 is ready."
- *Why It Fails:* The database is shared across all running instances. The moment the column is renamed, all v1 API instances immediately throw runtime SQL exceptions when trying to read or insert `telephone`.
- *The Fix:* Apply the expand-and-contract pattern. Keep both columns alive during the version transition, sync data, and delete the legacy column only after v1 is completely sunset.

**Trap 3: Returning `404 Not Found` Instead of `410 Gone` on Sunset**
- *The Mistake:* Removing old route handlers entirely from the router, causing the web framework's default 404 catch-all handler to respond when legacy clients connect.
- *Why It Fails:* A `404 Not Found` implies that the client made a typo in the URL or that the specific resource ID does not exist, prompting automated client retry loops and endless debugging.
- *The Fix:* Keep a lightweight stub handler for decommissioned routes that explicitly returns `410 Gone` along with a JSON payload linking to the migration guide.

**Trap 4: Missing `Vary` Headers on Header-Versioned APIs**
- *The Mistake:* Implementing header-based versioning (`API-Version: 2`) without setting the `Vary: API-Version` response header.
- *Why It Fails:* Intermediate proxies and CDNs cache the response keyed solely by the URL path. Legacy clients receive modern payloads they cannot parse, and modern clients receive legacy payloads missing essential fields.
- *The Fix:* Always register a global middleware that automatically attaches `Vary: API-Version, Accept` to every outbound HTTP response.

**Trap 5: Infinite Version Lifespans (Zero Sunset Policy)**
- *The Mistake:* Launching an API without a stated deprecation policy, committing to support every version indefinitely.
- *Why It Fails:* Supporting 10 years of historical API versions incurs massive maintenance drag, prevents database refactoring, complicates automated testing, and balloons cloud infrastructure costs.
- *The Fix:* Establish a clear Service Level Agreement (SLA) from day one (e.g., "We support each API version for 24 months following the release of its successor"). Actively communicate `Sunset` headers and enforce brownout schedules.

## 7. Compare With Related Concepts

| Concept | API Versioning | Database Schema Migration | GraphQL Schema Evolution | Feature Flags / Canary |
| :--- | :--- | :--- | :--- | :--- |
| **Primary Scope** | Network contract between client and server over HTTP. | Persistent data structures stored in the database engine. | Single evolving schema with field deprecation directives (`@deprecated`). | Dynamic runtime toggling of features for subsets of users. |
| **Mechanic** | URL paths, custom headers, or Accept media types. | SQL DDL scripts (`ALTER TABLE`) via Expand-Contract patterns. | Clients request only desired fields; unused fields are pruned over time. | Conditional `if/else` checks based on user targeting rules. |
| **Lifecycle** | Multi-year support cycle with formal deprecation and sunset. | Immediate or zero-downtime rolling schema transition. | Continuous additive evolution without formal whole-schema version numbers. | Ephemeral (days to weeks) until full rollout, then deleted. |
| **When to Use** | When introducing breaking changes to public or multi-client REST APIs. | When altering relational database tables or document collections. | When using GraphQL to avoid versioning by allowing granular client field selection. | When testing new backend features in production safely before full release. |

- **One-line rule:** Use **API Versioning** for breaking contract changes with external consumers; use **Expand-Contract Migrations** to evolve database tables safely behind those versions; use **GraphQL Evolution** if you want clients to request precise fields without version increments; and use **Feature Flags** to toggle new behaviors dynamically during deployment.

## 8. 🧠 The Memory Hook

> **The core engine lives only in the present; transformation gates translate the past.** Version URLs for public CDNs, version headers for internal microservices, and always expand-contract your database before touching a single route.
