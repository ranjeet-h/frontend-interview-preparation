# API Error Structure: RFC 7807 (Problem Details), Machine-Readable Envelopes, and Error Taxonomy

## 1. Why This Exists — The Problem First

Imagine shipping an e-commerce checkout page to production. Everything works fine on the happy path. Then a customer submits an expired credit card. 

The billing microservice returns `{ "error": "Card expired" }`. Your frontend reads `res.data.error` and displays a toast notification. Ten minutes later, another customer enters an invalid postal code. The address service returns `{ "message": "Invalid ZIP", "code": 4001 }`. Your frontend looks for `res.data.error`, finds `undefined`, and displays a blank red banner. Then an unexpected null-pointer crash happens in the inventory service. Nginx catches the 500 crash and returns a raw HTML page: `<html><body>500 Internal Server Error</body></html>`. The frontend attempts to run `response.json()`, throws `SyntaxError: Unexpected token < in JSON at position 0`, unhandled by the UI error boundary, and the entire browser screen goes completely white.

To make matters worse, a database unique constraint violation on the user registration route returns the raw PostgreSQL driver message: `psql: error: duplicate key value violates unique constraint "users_email_key" DETAIL: Key (email)=(admin@company.com) already exists`. Malicious actors now know your database engine, table names, constraint schema, and existing email records. When angry customers call support saying "Checkout failed at 2:15 PM," your engineering team sifts through 40 million log lines across 15 microservices and cannot find the failed request because no common correlation identifier connects the customer's screen to the backend server logs.

An API error structure is not just a JSON message. It is a formal, machine-readable contract between backend services, frontend applications, and observability platforms. Without a rigid, standardized structure, client applications crash during parsing, user interfaces cannot map validation mistakes to specific form inputs, security vulnerabilities leak database internals, and distributed production outages become impossible to debug.

## 2. The Analogy — Make It Obvious

Think of an API error response as a **Standardized Medical Diagnostic Lab Report**.

When you go to a hospital for diagnostic tests, the laboratory does not hand you a torn scrap of paper with the word "Sick!" scribbled on it. Nor does the doctor dump a 500-page internal medical textbook on your lap when an enzyme is slightly elevated. 

Instead, every hospital lab in the world issues a standardized, structured diagnostic report with distinct, non-overlapping fields:

1. **The Standard Department / Category (HTTP Status Code):** The header says "Department: Endocrinology / Out of Normal Range" (`422 Unprocessable Entity`). Anyone glancing at the top of the form knows what broad category of issue occurred.
2. **The Official Diagnostic Standard (`type` URI):** A reference link `https://standards.health.org/problems/glucose-out-of-range` pointing to the universal definition and protocol for this medical condition.
3. **The Short Human Summary (`title`):** "Blood Glucose Out of Range" — a stable, invariant description of this category of medical error.
4. **The Specific Instance Finding (`detail`):** "Fasting blood glucose measured at 165 mg/dL, which exceeds the normal reference range of 70-99 mg/dL."
5. **The Specific Parameter Breakdown (`invalid_params` / Field Errors):** The exact row pointing to `vial_id: "vial_04"`, `parameter: "fasting_glucose"`, `reason: "EXCEEDS_MAX_THRESHOLD"`. This tells the physician exactly which bodily marker failed without needing to re-read the entire narrative.
6. **The Machine-Readable Billing Code (`code`):** `ICD-10-E11.9`. The hospital's billing software, insurance automated clearinghouse, and pharmacy inventory systems parse this exact string to trigger automated insurance claims and pharmacy orders without ever reading English prose.
7. **The Specimen Barcode & Tracking Number (`instance` / `trace_id`):** `LAB-REC-2026-98412`. If the physician notices an anomaly, they scan the barcode. The central laboratory database instantly pulls up the exact spectrometer calibration logs, technician shift notes, and temperature readings for that specific blood sample.

RFC 7807 and modern enterprise error envelopes do the exact same thing for software: they give automated machines a stable code to act on, give users a clear explanation of what went wrong, give frontend forms exact field pointers to highlight input borders in red, and give DevOps engineers a unique trace ID to pull up the exact distributed spans in their logging dashboards.

## 3. How It Actually Works — The Full Explanation

Standardizing API errors requires coordinating HTTP transport semantics, serialization standards, machine-readable domain codes, field validation schemas, distributed tracing identifiers, and security sanitization.

### RFC 7807 and RFC 9457: Problem Details for HTTP APIs

RFC 7807 (updated by RFC 9457) is the official IETF standard for HTTP error responses. It defines the `application/problem+json` media type and establishes five standard top-level members:

- `type` (string URI): A URI reference that identifies the problem type. When dereferenced in a browser, it should ideally provide human-readable documentation for the problem. When no specific URI is defined, it defaults to `"about:blank"`, indicating the error has no further semantics beyond the HTTP status code.
- `title` (string): A short, human-readable summary of the problem type. This SHOULD NOT change between occurrences of the same problem type (e.g., `"Validation Failed"` or `"Insufficient Funds"`).
- `status` (number): The HTTP status code generated by the origin server for this occurrence of the problem (e.g., `422`, `404`, `409`). Placing the status code inside the JSON payload ensures that if intermediate proxies, logging systems, or client SDKs strip HTTP headers, the payload remains self-describing.
- `detail` (string): A human-readable explanation specific to this particular occurrence of the problem (e.g., `"Your account balance is $12.50, but the transaction required $50.00"`).
- `instance` (string URI): A URI reference that identifies the specific occurrence of the problem. Often maps to the API endpoint path or a unique error instance URI (e.g., `"/orders/ord_88192/payments"` or `"/errors/err_01HXYZ"`).

RFC 7807 explicitly allows **Extension Members**. In production systems, companies extend RFC 7807 with three essential properties:
- `code` (string): A stable, machine-readable domain error code (e.g., `INSUFFICIENT_FUNDS`, `ORDER_ALREADY_CANCELLED`).
- `invalid_params` or `errors` (array): A list of individual field-level validation failures.
- `trace_id` (string): The distributed tracing correlation identifier (e.g., Datadog trace ID, AWS X-Ray ID, or W3C `traceparent`).

### The Enterprise HTTP Status Code Taxonomy

A robust API never invents arbitrary HTTP codes, nor does it collapse all errors into `400` or `500`. Every error maps to an intentional status code in the HTTP matrix:

```txt
Client Errors (4xx) — The caller must change the request before retrying:
├── 400 Bad Request          → Malformed syntax, unparseable JSON, illegal query params.
├── 401 Unauthorized         → Authentication missing, malformed JWT, expired token.
├── 403 Forbidden            → Authenticated identity lacks permission (RBAC/ABAC check failed).
├── 404 Not Found            → Resource does not exist (or hidden to prevent enumeration).
├── 409 Conflict             → State conflict (optimistic lock mismatch, resource already exists).
├── 422 Unprocessable Entity → Syntactically valid JSON, but violates business/schema validation.
└── 429 Too Many Requests    → Rate limit exceeded (must return Retry-After header).

Server Errors (5xx) — The server failed; the client may retry depending on the error:
├── 500 Internal Server Error → Unhandled exception, crash, or unexpected runtime failure.
├── 502 Bad Gateway          → Upstream dependency or external payment gateway returned invalid data.
├── 503 Service Unavailable  → Server overloaded, database pool exhausted, or circuit breaker open.
└── 504 Gateway Timeout      → Upstream microservice or database query timed out.
```

### Machine-Readable Domain Codes vs Human-Readable Messages

A major architectural trap is using the English `message` or `detail` string to drive client UI logic. 

Consider what happens when a frontend does:
```js
if (error.detail === "User already exists") {
  navigate("/login");
}
```
If the backend team improves the copy to `"An account with this email address already exists"`, or if the application adds Spanish localization (`"El usuario ya existe"`), the frontend comparison silently fails, leaving the user stuck on the registration form.

Domain error codes (`code`) solve this. They are uppercase, snake_case strings representing immutable business failure modes:
- `INSUFFICIENT_FUNDS`
- `CARD_EXPIRED`
- `EMAIL_ALREADY_REGISTERED`
- `ORGANIZATION_SEAT_LIMIT_REACHED`
- `PASSWORD_COMPROMISED_IN_BREACH`

The frontend inspects `code` to choose the UI state, navigation flow, or localized string dictionary key. The backend `detail` string serves as a fallback for developers and non-localized debug output.

### Field-Level Validation Error Breakdown

Forms in modern web and mobile applications have dozens of fields. When a batch submission fails validation, returning `"Validation error: name is too short and email is invalid"` forces the frontend to parse strings with regular expressions.

Instead, validation errors must return an array of structured objects containing:
- `field`: The property path using dot notation for nested objects or array indices (e.g., `"billing_address.postal_code"` or `"items[2].quantity"`).
- `reason`: A machine-readable reason code (e.g., `"INVALID_FORMAT"`, `"MIN_VALUE_VIOLATION"`, `"REQUIRED_FIELD_MISSING"`).
- `detail`: A human-friendly explanation of why that specific field failed validation.
- `rejected_value` (optional): The sanitized value that failed (omitted for passwords, tokens, or PII).

### Correlation IDs and Distributed Observability

In a modern architecture, a single user request travels through an API Gateway, an Authentication Service, an Order Orchestrator, an Inventory Database, and a Payment Provider.

When an unhandled exception occurs four levels deep in the call stack:
1. The ingress gateway assigns or reads a `trace_id` (e.g., from the W3C `traceparent` header or generates a UUID `req_01HP8Z...`).
2. Every internal service passes this header to downstream RPCs and attaches it to every structured log statement.
3. When the error response reaches the client, the error payload includes `"trace_id": "req_01HP8Z..."` alongside the `X-Request-ID` HTTP response header.
4. If a user contacts customer support or an automated alert triggers, an engineer enters `req_01HP8Z...` into OpenTelemetry, Datadog, or Grafana Tempo. The exact end-to-end distributed flamegraph appears in seconds, pinpointing the failing line of code.

### Security Sanitization: The Public vs Private Error Firewall

Production systems must enforce a strict firewall between what is logged internally and what is returned over the public wire.

```txt
┌────────────────────────────────────────────────────────┐
│               Unhandled Runtime Exception              │
│  (Database Connection Timeout, Null Pointer, SQL Error)│
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│            Global Error Handling Middleware            │
├────────────────────────────────────────────────────────┤
│ 1. Capture full stack trace, SQL query, & context      │
│ 2. Generate unique trace_id: req_98a72b                │
│ 3. Log FULL details to internal logging system         │
│ 4. Sanitize payload for external client:               │
│    - Strip stack trace                                 │
│    - Strip internal hostnames & database table names   │
│    - Replace raw message with generic safety message   │
│    - Attach public trace_id for support referencing    │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│         Sanitized RFC 7807 Public HTTP Response        │
│ {                                                      │
│   "type": "https://api.domain.com/errors/internal",   │
│   "title": "Internal Server Error",                    │
│   "status": 500,                                       │
│   "detail": "An unexpected error occurred...",        │
│   "trace_id": "req_98a72b"                             │
│ }                                                      │
└────────────────────────────────────────────────────────┘
```

## 4. Real Code — See It Working

Here is a complete, production-ready enterprise error handling architecture written in TypeScript and Express, implementing RFC 7807 envelopes, domain error classes, validation field extraction, and secure middleware.

```typescript
// types/api-error.ts
// Standard RFC 7807 Problem Details envelope with enterprise extensions
export interface FieldValidationError {
  field: string;
  reason: string;
  detail: string;
  rejected_value?: unknown;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  code: string;
  trace_id: string;
  invalid_params?: FieldValidationError[];
  retryable?: boolean;
}

// errors/app-error.ts
// Base application error class supporting structured domain context
export abstract class AppError extends Error {
  abstract readonly statusCode: number;
  abstract readonly code: string;
  abstract readonly title: string;
  readonly retryable: boolean;

  constructor(
    message: string,
    retryable: boolean = false
  ) {
    super(message);
    this.name = this.constructor.name;
    this.retryable = retryable;
    // Captures clean stack trace without the constructor call
    Error.captureStackTrace(this, this.constructor);
  }
}

// errors/validation-error.ts
export class ValidationError extends AppError {
  readonly statusCode = 422;
  readonly code = "VALIDATION_FAILED";
  readonly title = "Validation Failed";
  readonly invalidParams: FieldValidationError[];

  constructor(invalidParams: FieldValidationError[]) {
    super("One or more fields failed validation checks.");
    this.invalidParams = invalidParams;
  }
}

// errors/domain-errors.ts
export class InsufficientFundsError extends AppError {
  readonly statusCode = 422;
  readonly code = "INSUFFICIENT_FUNDS";
  readonly title = "Insufficient Funds";

  constructor(currentBalance: number, requiredAmount: number) {
    super(`Current balance of $${currentBalance.toFixed(2)} is less than required $${requiredAmount.toFixed(2)}.`);
  }
}

export class ResourceNotFoundError extends AppError {
  readonly statusCode = 404;
  readonly code = "RESOURCE_NOT_FOUND";
  readonly title = "Resource Not Found";

  constructor(resourceName: string, id: string) {
    super(`${resourceName} with identifier '${id}' was not found.`);
  }
}

export class StateConflictError extends AppError {
  readonly statusCode = 409;
  readonly code = "RESOURCE_CONFLICT";
  readonly title = "State Conflict";

  constructor(message: string) {
    super(message);
  }
}
```

Now let's implement the centralized Express error middleware that transforms all errors—both operational domain errors and unhandled programmer crashes—into compliant RFC 7807 responses:

```typescript
// middleware/error-handler.ts
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { AppError, ValidationError } from "../errors/app-error";
import { ProblemDetails } from "../types/api-error";

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // NextFunction must be present in the signature for Express to recognize 4-param error middleware
  _next: NextFunction
): void {
  // Extract existing trace ID from gateway header or generate a fresh correlation UUID
  const traceId = (req.headers["x-request-id"] as string) || `req_${crypto.randomUUID()}`;
  const instanceUri = req.originalUrl || req.url;
  const isProduction = process.env.NODE_ENV === "production";

  // Case 1: Known operational domain errors thrown intentionally by application logic
  if (err instanceof AppError) {
    const responsePayload: ProblemDetails = {
      type: `https://api.example.com/errors/${err.code.toLowerCase().replace(/_/g, "-")}`,
      title: err.title,
      status: err.statusCode,
      detail: err.message,
      instance: instanceUri,
      code: err.code,
      trace_id: traceId,
      retryable: err.retryable,
    };

    // Attach field-level validation errors if this is a validation failure
    if (err instanceof ValidationError) {
      responsePayload.invalid_params = err.invalidParams;
    }

    // Set standard RFC 7807 media type header
    res.setHeader("Content-Type", "application/problem+json");
    res.status(err.statusCode).json(responsePayload);
    return;
  }

  // Case 2: Unhandled programmer errors, syntax crashes, or database connection losses
  // Log full stack trace and internal context to server logs with trace_id for debugging
  console.error(`[CRITICAL] Unhandled Exception [TraceID: ${traceId}]:`, {
    errorName: err.name,
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
  });

  // Never expose internal database queries, file paths, or stack traces to public clients
  const sanitizedServerPayload: ProblemDetails = {
    type: "https://api.example.com/errors/internal-server-error",
    title: "Internal Server Error",
    status: 500,
    detail: isProduction
      ? "An unexpected internal server error occurred. Please contact support with the trace_id."
      : err.message, // Allow detailed message in development only
    instance: instanceUri,
    code: "INTERNAL_SERVER_ERROR",
    trace_id: traceId,
    retryable: true, // Transient 500s can be retried with exponential backoff
  };

  res.setHeader("Content-Type", "application/problem+json");
  res.status(500).json(sanitizedServerPayload);
}
```

Now let's see how a frontend application (TypeScript / React / Axios) consumes this standardized error structure cleanly without string parsing:

```typescript
// frontend/api-client.ts
import axios, { AxiosError } from "axios";
import { ProblemDetails } from "./types/api-error";

export async function submitTransfer(recipientId: string, amount: number) {
  try {
    const response = await axios.post("/api/transfers", { recipientId, amount });
    return { success: true, data: response.data };
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) {
      const problem = error.response.data as ProblemDetails;

      // Programmatic handling based on stable machine-readable codes
      switch (problem.code) {
        case "INSUFFICIENT_FUNDS":
          // Open top-up modal directly without inspecting English error text
          return { success: false, action: "OPEN_TOP_UP_MODAL", message: problem.detail };

        case "VALIDATION_FAILED":
          // Map invalid_params directly to form input error states
          const formErrors: Record<string, string> = {};
          problem.invalid_params?.forEach((param) => {
            formErrors[param.field] = param.detail;
          });
          return { success: false, action: "SET_FIELD_ERRORS", fieldErrors: formErrors };

        case "UNAUTHORIZED":
          return { success: false, action: "REDIRECT_LOGIN" };

        default:
          // Generic fallback showing detail and support ticket trace reference
          return {
            success: false,
            action: "SHOW_TOAST",
            message: `${problem.detail} (Reference ID: ${problem.trace_id})`,
          };
      }
    }

    // Network or client offline failure
    return { success: false, action: "SHOW_TOAST", message: "Network connection lost. Please retry." };
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is RFC 7807 (Problem Details for HTTP APIs) and why should a modern API adopt it over custom error envelopes?**

RFC 7807 is an IETF standard that specifies a common JSON schema and media type (`application/problem+json`) for conveying machine-readable and human-readable details about HTTP errors. Before RFC 7807, every team and library invented proprietary JSON shapes (e.g., `{ error: "msg" }`, `{ errCode: 12, msg: "" }`, `{ success: false, errors: [] }`). 

Adopting RFC 7807 solves three major architectural challenges:
1. **Predictable Client Parsing:** Third-party API consumers and frontend SDKs can write a single, universal HTTP interceptor that knows where to find the error code, summary, human detail, and trace ID on every single 4xx and 5xx response across hundreds of microservices.
2. **Standard Extensibility:** It defines standard keys (`type`, `title`, `status`, `detail`, `instance`) while officially supporting custom extension members (like `code`, `invalid_params`, and `trace_id`) so domain-specific needs do not break the standard schema.
3. **Ecosystem Tooling:** API gateways (Kong, Apigee, AWS API Gateway), service meshes, and documentation tools (OpenAPI/Swagger) have built-in support for generating and validating RFC 7807 problem documents out of the box.

**Q: Why should client applications never use the error `message` string to branch UI logic or control application flow?**

Error messages are designed exclusively for human consumption. Relying on `if (err.message.includes("not found"))` causes immediate production brittleness for four reasons:
1. **Copy Updates:** If a product manager rewrites the message from `"User not found"` to `"We couldn't locate an account with that email"`, the frontend string match fails silently.
2. **Internationalization (i18n):** If the backend localizes messages to German, French, or Japanese based on the `Accept-Language` header, all string-based client checks break immediately.
3. **Ambiguity:** Multiple distinct failure conditions can have similar human wording (e.g., `"Item not available"` could mean the item does not exist, is out of stock, or is restricted in the user's geographic region).
4. **Machine Code Contract:** The machine-readable `code` (e.g., `ITEM_OUT_OF_STOCK` vs `ITEM_GEO_RESTRICTED`) is an immutable, versioned enum that never changes across copy edits or language translations.

**Q: When should an API return HTTP 400 vs 422 vs 409 for invalid data or state conflicts?**

These three status codes represent distinct failure layers in the request lifecycle:
- **HTTP 400 (Bad Request):** Represents a **syntactic or transport-level failure**. The client sent malformed JSON (unclosed curly braces), invalid query parameters that cannot be parsed into types, or violated HTTP protocol constraints. The server cannot even deserialize the payload into an object.
- **HTTP 422 (Unprocessable Entity):** Represents a **semantic schema validation failure**. The JSON is syntactically well-formed, but the data violates business or schema rules (e.g., the `email` string is not a valid email address, `age` is negative, or `end_date` is before `start_date`). This is where field-level `invalid_params` arrays belong.
- **HTTP 409 (Conflict):** Represents a **resource state collision**. The payload is syntactically valid and passes schema validation, but executing the operation would violate an invariant in the underlying state machine or storage engine (e.g., attempting to register with an email that is already taken, attempting to delete an organization that still has active member accounts, or an optimistic locking version mismatch where another user updated the document first).

**Q: How should field-level validation errors be structured for complex, nested payloads?**

Field-level validation errors should be returned as an array of objects under an `invalid_params` (RFC 7807 standard) or `errors` extension member. To support deeply nested objects and arrays of items, use standard dot notation and index brackets for the `field` property:

```json
{
  "type": "https://api.example.com/errors/validation-failed",
  "title": "Validation Failed",
  "status": 422,
  "detail": "3 validation errors occurred while processing your order submission.",
  "instance": "/orders/checkout",
  "code": "VALIDATION_FAILED",
  "trace_id": "req_88a91bce",
  "invalid_params": [
    {
      "field": "customer.email",
      "reason": "INVALID_EMAIL_FORMAT",
      "detail": "Email must contain a valid domain name."
    },
    {
      "field": "shipping_address.postal_code",
      "reason": "INVALID_POSTAL_CODE",
      "detail": "Postal code must be 5 digits for US addresses."
    },
    {
      "field": "items[2].quantity",
      "reason": "MIN_VALUE_EXCEEDED",
      "detail": "Item quantity must be at least 1."
    }
  ]
}
```
This structure enables frontend form libraries (such as React Hook Form or Formik) to split paths by dots and brackets (`customer.email`) and set form errors directly on the targeted inputs with zero string manipulation.

**Q: How do correlation IDs (`trace_id` / `request_id`) work across distributed microservices during error handling?**

A correlation ID is a globally unique identifier (UUID v4 or W3C Trace Context `traceparent`) generated at the ingress API gateway when an HTTP request enters the infrastructure. 

The lifecycle works as follows:
1. **Ingress & Propagation:** The API Gateway injects the ID into the HTTP headers (`X-Request-ID` and `traceparent`). As the request hops across internal microservices via REST, gRPC, or message brokers (Kafka/RabbitMQ), each service forwards this header.
2. **Contextual Logging:** Every service uses structured logging (e.g., Winston, Pino, Logback) configured with AsyncLocalStorage or Mapped Diagnostic Context (MDC) so that every single log line emitted during that request automatically includes the `trace_id`.
3. **Error Response Attachment:** If any service crashes or returns an error, the global error middleware extracts the `trace_id` and places it both in the response headers and inside the RFC 7807 JSON body.
4. **Support & Observability Workflow:** When a customer encounters an error, the frontend displays `"Error Reference: req_01HP8Z"`. When the user quotes this ID to support, developers search `trace_id: req_01HP8Z` in their centralized logging dashboard (Datadog, Elastic, CloudWatch) to instantly view the entire unified log trace across all participating microservices.

**Q: How do you prevent internal implementation details (SQL errors, stack traces) from leaking while keeping errors debuggable in production?**

Preventing information leakage requires a two-tier error handling pattern:
1. **Internal Error Classification:** Differentiate between **Operational Errors** (known, expected domain failures like invalid passwords, expired cards, or not found resources) and **Programmer Errors** (unexpected runtime exceptions like null pointers, database connection timeouts, or unhandled promise rejections).
2. **Operational Errors:** These inherit from a custom `AppError` class. They have defined HTTP status codes, safe public messages, and machine-readable domain codes. They are serialized directly into the RFC 7807 response.
3. **Programmer Errors:** When an unhandled error occurs, the global error middleware catches it, logs the full exception (including name, message, stack trace, request body, and caller IP) to internal log storage with a generated `trace_id`. 
4. **Sanitized Public Response:** The middleware converts the response into a generic `500 Internal Server Error` with `detail: "An unexpected error occurred. Please contact support."` and attaches the `trace_id`. The client receives zero internal stack traces, database table names, or file paths, but engineers can look up the complete stack trace using the `trace_id`.

**Q: Should error responses always return HTTP 200 with `{ "status": "error" }` (GraphQL style) or standard HTTP 4xx/5xx status codes?**

In REST and HTTP-based APIs, errors must **always** use standard HTTP 4xx and 5xx status codes. The "HTTP 200 OK with `{ status: "error" }`" pattern is a dangerous anti-pattern in REST APIs for several reasons:
- **HTTP Caching & CDNs:** Proxies, CDNs (Cloudflare, Fastly), and browser caches cache HTTP 200 responses by default unless strict `Cache-Control` headers are configured. If a user receives an error response over HTTP 200, an intermediate cache might serve that error response to subsequent requests from other users.
- **Client Networking Libraries:** HTTP client libraries (Axios, Fetch wrappers, Android Retrofit, iOS URLSession) automatically route non-2xx status codes to `catch` blocks. Returning 200 forces every single caller to write boilerplate `if (res.data.status === 'error')` checks on every network call.
- **API Gateways & Circuit Breakers:** Gateways and load balancers (Envoy, Nginx, AWS ALB) monitor upstream health and trigger automated circuit breaking based on 5xx status rates. Returning 200 hides backend outages from infrastructure monitoring.

*Note on GraphQL:* GraphQL returns 200 for partial execution failures because GraphQL allows requesting multiple resources in one query where some fields succeed and others fail. However, REST endpoints represent atomic operations on distinct resources and must use standard HTTP semantics.

**Q: How do you handle transient vs permanent errors, and how should retry metadata be communicated to clients?**

Errors are categorized as either **permanent** (client must change the request; retrying immediately will always fail) or **transient** (temporary server overload or network blip; retrying after a delay may succeed).

- **Permanent Errors (400, 401, 403, 404, 422):** The client must never retry automatically. The payload should have `retryable: false`.
- **Transient Errors (429, 503, 504):** The server should indicate retryability via standard HTTP headers and JSON attributes:
  1. **HTTP `Retry-After` Header:** For `429 Too Many Requests` or `503 Service Unavailable`, return `Retry-After: 30` (seconds) or an HTTP-date timestamp.
  2. **JSON Envelope Extension:** Add `"retryable": true` and `"retry_after_seconds": 30` to the RFC 7807 problem body.
  3. **Client Backoff:** Clients receiving a retryable error should implement **Exponential Backoff with Full Jitter** (e.g., `wait = random(0, min(max_backoff, base * 2 ^ attempt))`) to prevent the Thundering Herd problem from overwhelming the recovering backend.

## 6. The Traps — What Goes Wrong

### Trap 1: The "HTTP 200 OK with `{ success: false }`" Anti-Pattern

- **The Wrong Assumption:** "Returning HTTP 200 for everything makes frontend error handling easier because fetch requests never reject."
- **Why It's Wrong:** It breaks the foundational architecture of the web. Reverse proxies (Cloudflare, Varnish) cache the error response. Infrastructure monitoring (Datadog APM, AWS CloudWatch) records a 100% success rate even when the database is completely offline. Frontend developers forget to check `res.data.success`, causing downstream components to attempt reading `res.data.user.name` on `undefined` and crashing the React tree.
- **What to Do Instead:** Return semantic 4xx and 5xx status codes. Configure Axios/Fetch interceptors to centralize non-2xx error handling in a single place.

### Trap 2: Leaking Database Schema and Stack Traces in Production

- **The Wrong Assumption:** "Returning the exact database error message in development helps us debug faster, so we'll just pass `err.message` directly to the client."
- **Why It's Wrong:** When code deploys to production without strict environment-based sanitization, an SQL constraint violation returns: `QueryFailedError: relation "auth_tokens" does not exist in query SELECT * FROM auth_tokens WHERE user_id = $1`. Attackers use these error leaks to perform SQL injection reconnaissance, discover table structures, identify backend ORMs, and map internal network addresses.
- **What to Do Instead:** Enforce a strict global error middleware that intercepts all non-`AppError` exceptions, logs the full stack trace server-side with a unique `trace_id`, and returns a sanitized, generic 500 error to the client containing only the `trace_id`.

### Trap 3: Inconsistent Error Shapes Across Routes and Microservices

- **The Wrong Assumption:** "Each team can format errors however they want as long as there is an error message."
- **Why It's Wrong:** Service A returns `{ error: "Not found" }`. Service B returns `{ message: "Not found", code: 404 }`. Service C returns `{ errors: ["Not found"] }`. Nginx returns raw HTML. The frontend client has to write defensive, spaghetti code with multiple fallback checks: `const msg = res.error || res.message || (res.errors && res.errors[0]) || "Unknown error"`. When an unexpected shape arrives, the UI breaks.
- **What to Do Instead:** Mandate an organization-wide RFC 7807 standard. Enforce it using shared backend middleware libraries, API gateway response transformations, and automated contract tests (e.g., using Spectral or OpenAPI schema validation in CI/CD).

### Trap 4: Branching Frontend UI Logic on English Error Strings

- **The Wrong Assumption:** "Checking `if (error.message === 'Invalid credentials')` is quick and gets the feature shipped."
- **Why It's Wrong:** Error messages are volatile human copy. If a backend engineer fixes a typo, rewords a phrase for better user experience, or adds internationalization (`i18n`), all frontend conditional logic silently breaks.
- **What to Do Instead:** Always return and inspect stable, machine-readable domain error codes (`code: "INVALID_CREDENTIALS"`). Use the error code as the key for localized frontend string dictionaries.

### Trap 5: Returning Field Validation Errors as a Single Concatenated String

- **The Wrong Assumption:** "Returning `message: 'Name is required, Email is invalid, Age must be positive'` is good enough for form validation."
- **Why It's Wrong:** The frontend cannot programmatically determine which specific form inputs need red border highlights or which error message belongs under which input field without complex regex parsing.
- **What to Do Instead:** Return an array of structured field errors in the `invalid_params` property, with exact dot-notated field paths (`"billing_address.city"`) and granular error reason codes.

### Trap 6: Missing Correlation IDs on Handled Domain Errors

- **The Wrong Assumption:** "We only need correlation IDs for 500 server crashes; 4xx client errors don't need trace IDs."
- **Why It's Wrong:** When a user calls customer support saying "I kept getting a 422 error saying my tax ID was invalid, but I know it's valid," support engineers have no way to find the exact request payload and validation logs without a `trace_id`.
- **What to Do Instead:** Generate and return a `trace_id` in **every single** response envelope, whether the response status is 200, 422, or 500.

## 7. Compare With Related Concepts

| Concept | RFC 7807 Problem Details | Custom `{ success: false }` Envelope | GraphQL Error Format | gRPC Status / Error Model |
| :--- | :--- | :--- | :--- | :--- |
| **Standardization** | Official IETF Standard (RFC 7807 / RFC 9457). | Proprietary per company or backend framework. | Official GraphQL Specification (`errors` array). | Official Google / gRPC Richer Error Model (`google.rpc.Status`). |
| **Media Type** | `application/problem+json` | `application/json` | `application/json` | `application/grpc` (Protobuf binary) |
| **HTTP Status Codes** | Uses standard HTTP 4xx/5xx status codes strictly. | Often abused with HTTP 200 OK or inconsistent codes. | Always returns HTTP 200 OK (errors in payload). | Transport status code mapped to gRPC canonical code (0-16). |
| **Field Validation** | Structured under standard extension `invalid_params`. | Custom arrays (e.g. `errors: []`, `details: []`). | Structured in `extensions` object per error item. | Embedded `google.rpc.BadRequest.FieldViolation` protobufs. |
| **Primary Use Case** | Public & internal RESTful HTTP APIs. | Legacy web APIs and quick monolithic prototypes. | GraphQL APIs with partial field resolution. | High-performance internal microservice RPCs. |

### RFC 7807 vs Custom Envelopes
A custom `{ "success": false, "error": { ... } }` envelope creates friction because every external consumer and internal frontend must learn a bespoke format. RFC 7807 provides a universally recognized schema with standard keys (`type`, `title`, `status`, `detail`, `instance`) that integrates directly with API documentation tools, gateways, and client libraries.

### HTTP Transport Codes vs Domain Error Codes
HTTP status codes (like `422` or `409`) communicate the **transport and architectural category** of the error to proxies, firewalls, and HTTP clients. Domain error codes (like `CARD_DECLINED_INSUFFICIENT_FUNDS` or `USERNAME_ALREADY_TAKEN`) communicate the **business-level failure reason** to the application logic. A robust API uses both: HTTP status for transport semantics, and domain codes for application routing.

### Public Client Envelopes vs Internal Microservice Errors
Public-facing client errors must prioritize sanitization, clarity, field mapping, and localization. Internal microservice errors (such as gRPC `google.rpc.Status` or internal RPC exceptions) can pass rich technical metadata, internal stack traces, and database error states across service boundaries because they operate within a trusted network perimeter.

## 8. 🧠 The Memory Hook — What Sticks

Think of an API error like a formal **Hospital Lab Report**:
- The **HTTP Status** is the medical department (`422` = Metabolic Out of Range).
- The **Domain Code** is the standardized billing code (`INSUFFICIENT_FUNDS` = `ICD-10`) that software automates on without reading English.
- The **Detail** is the doctor's human note for the patient.
- The **Invalid Params** are the exact blood markers flagged red on the form.
- The **Trace ID** is the barcode on the test tube that lets engineers instantly pull up the spectrometer logs.
