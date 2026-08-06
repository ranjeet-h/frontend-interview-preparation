# HTTP Request Lifecycle

## Detailed explanation

An HTTP request lifecycle is the path a client request follows from browser or app, through the network, into the backend server, through middleware and route logic, then back as an HTTP response. Senior backend interviews expect you to explain not only the handler function, but also DNS, TLS, reverse proxy, routing, validation, database calls, error handling, logging, and response serialization.

## 1. One-line mental model

A backend request lifecycle is a pipeline that receives a request, applies cross-cutting rules, runs business logic, and returns a structured response.

## 2. Problem it solves

Without a clear lifecycle model, backend code becomes random handler logic with inconsistent auth, validation, errors, logs, and response shapes.

## 3. Core idea

- The client creates an HTTP request with method, URL, headers, body, and cookies.
- DNS, TCP, and TLS get the request to the right server securely.
- A reverse proxy or load balancer may terminate TLS and route the request.
- Backend middleware handles logging, CORS, auth, parsing, validation, and rate limiting.
- The route/controller runs business logic, calls services/databases, then serializes the response.

## 4. Visual / analogy

```txt
Client
  -> DNS/TCP/TLS
  -> CDN / reverse proxy / load balancer
  -> backend server
  -> middleware
  -> route/controller
  -> service layer
  -> database/cache/queue
  -> response serializer
  -> client
```

It is like a factory assembly line: each station does one job before the final package leaves.

## 5. Minimal example

```js
app.get("/users/:id", auth, async (req, res, next) => {
  try {
    const user = await userService.getById(req.params.id);
    res.json({ data: user });
  } catch (error) {
    next(error);
  }
});
```

## 6. Real-world example

```txt
GET /api/orders/123
Auth middleware validates cookie/JWT.
Validation middleware checks order id.
Controller calls order service.
Service checks permissions.
Repository queries database.
Response serializer hides internal fields.
Logger records status code and latency.
```

## 7. Common interview questions

#### What happens after a browser sends an HTTP request?
- **The Engine Mechanism (Why it behaves this way):** The browser first resolves the domain via DNS to an IP address, then establishes a TCP connection (three-way handshake), negotiates TLS for HTTPS, and sends the HTTP request. The request passes through CDNs and reverse proxies, reaches the backend server, traverses middleware layers (logging, CORS, auth, parsing, validation), hits the route handler which calls services and databases, then the response is serialized and sent back through the same network path.
- **The Unforgettable Mental Model:** The **Airport Journey**. DNS is your GPS finding the airport. TCP is the runway being prepared. TLS is the security checkpoint. Middleware is immigration, customs, and baggage screening. The route handler is your actual flight. The response is you arriving at your destination.
- **The Trap:** Saying the request goes "straight to the server." In production, it passes through DNS, CDN, load balancer, reverse proxy, TLS termination, multiple middleware layers, and possibly service mesh sidecars before reaching your handler.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: After a browser sends an HTTP request, DNS resolves the domain to an IP, TCP establishes the connection, and TLS negotiates encryption for HTTPS. The request then flows through any CDN and reverse proxy, reaches the backend server, and passes through middleware layers — logging, CORS, authentication, body parsing, and validation — before reaching the route handler. The handler executes business logic, queries databases or external services, serializes the response, and sends it back through the same infrastructure chain to the browser."

#### Where does authentication happen in the lifecycle?
- **The Engine Mechanism (Why it behaves this way):** Authentication runs as early middleware, before route matching or business logic. The auth middleware extracts credentials (JWT from Authorization header, session cookie, or API key), validates them (signature check, expiry, revocation lookup), and attaches the user identity to the request object (`req.user`). If validation fails, it returns 401 immediately, preventing the request from reaching the handler.
- **The Unforgettable Mental Model:** The **Bouncer at the Club Door**. Before anyone enters, the bouncer checks ID. No valid ID means no entry — you never get to the bar, the dance floor, or the VIP room.
- **The Trap:** Putting auth logic inside individual route handlers instead of middleware. This leads to duplicated auth code, inconsistent behavior, and routes that forget to check authentication.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Authentication should happen as early middleware in the request pipeline, before any route handler executes. The middleware extracts credentials from the request — typically a JWT from the Authorization header or a session cookie — validates the signature and expiry, checks for revocation if needed, and attaches the verified user identity to the request context. If authentication fails, it short-circuits with a 401 response, protecting all downstream handlers."

#### Why use middleware?
- **The Engine Mechanism (Why it behaves this way):** Middleware functions receive the request, response, and a `next` callback. They can read/modify the request, end the response early, or pass control to the next function. This creates a composable pipeline where cross-cutting concerns — logging, CORS, auth, parsing, validation, rate limiting, error handling — are written once and applied to many routes through `app.use()` or route-level mounting.
- **The Unforgettable Mental Model:** The **Assembly Line Stations**. Each station does one specialized job — quality check, painting, labeling — before the product moves to the next station. No station needs to know about the others' work.
- **The Trap:** Assuming middleware order doesn't matter. If auth runs after body parsing fails, or if error middleware is registered before routes, the pipeline breaks. Middleware executes in registration order.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware creates a composable pipeline for cross-cutting concerns. Instead of duplicating logging, authentication, validation, and error handling in every route handler, middleware lets you write these concerns once and apply them globally or to specific route groups. Each middleware function can inspect or modify the request, end the response early, or pass control downstream. The key is that middleware order matters — they execute in the sequence they're registered."

#### Where should request validation live?
- **The Engine Mechanism (Why it behaves this way):** Request validation should run as middleware after body parsing but before the route handler. The validation layer checks the parsed request body, query parameters, and route params against a schema (Zod, Joi, Yup, etc.). If validation fails, it returns a 400 or 422 with field-level errors. This prevents invalid data from ever reaching business logic, keeping handlers focused on domain operations.
- **The Unforgettable Mental Model:** The **Airport Security Scanner**. Before you board the plane (business logic), your luggage (request data) goes through the scanner. Anything suspicious gets flagged and you don't proceed — no need to check again at the gate.
- **The Trap:** Validating only on the frontend. Client-side validation is for UX; server-side validation is for security. Always validate on the backend because clients can be bypassed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Request validation should live as middleware between body parsing and the route handler. After the request body is parsed into a JavaScript object, a validation schema checks types, required fields, formats, and constraints. If validation fails, the middleware returns a structured error response with field-level details, preventing invalid data from reaching business logic. This keeps handlers clean and ensures all inputs are verified at the system boundary."

#### Where should business logic live?
- **The Engine Mechanism (Why it behaves this way):** Business logic should live in a service layer, not in route handlers/controllers. Controllers should only parse the request, call the appropriate service method, and format the response. Services contain the domain rules, coordinate multiple repositories, handle transactions, and enforce business invariants. This separation makes code testable (services can be unit tested without HTTP), reusable (same service called from different endpoints), and maintainable.
- **The Unforgettable Mental Model:** The **Restaurant Kitchen**. The waiter (controller) takes your order and delivers food. The chef (service) actually cooks the meal following recipes. The pantry (repository) stores ingredients. The waiter doesn't cook; the chef doesn't take orders.
- **The Trap:** Putting database queries, email sending, and business rules directly inside route handlers. This creates "fat controllers" that are hard to test, impossible to reuse, and tightly coupled to the HTTP layer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Business logic should live in a dedicated service layer, separate from route handlers. Controllers should be thin — they parse the request, call the service, and serialize the response. Services contain the actual domain logic: they orchestrate repositories, enforce business rules, manage transactions, and handle side effects. This separation makes services independently testable, reusable across different endpoints or consumers, and keeps the HTTP layer focused on transport concerns."

#### How do errors move through the backend pipeline?
- **The Engine Mechanism (Why it behaves this way):** Errors propagate via `try/catch` in async handlers or by passing them to `next(error)` in Express-style frameworks. The error bubbles up through the middleware chain until it reaches a centralized error-handling middleware (identified by its four-parameter signature: `err, req, res, next`). This middleware classifies the error (validation, auth, not-found, internal), maps it to the appropriate HTTP status code, formats a consistent error response, and logs the details.
- **The Unforgettable Mental Model:** The **Emergency Response System**. When something goes wrong at any station, an alarm sounds. The error travels up the chain until it reaches the emergency control room (error handler), which dispatches the right response — fire extinguisher for validation errors, evacuation for server errors.
- **The Trap:** Catching errors in every route handler and responding differently. This creates inconsistent error formats, makes frontend error handling chaotic, and loses the ability to centrally log and monitor failures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Errors should propagate through the middleware chain using a consistent mechanism — typically `next(error)` in Express or async handler wrappers. A centralized error-handling middleware at the end of the pipeline catches all errors, classifies them by type, maps them to appropriate HTTP status codes, formats a consistent JSON error response, and logs the details. This ensures every endpoint returns errors in the same shape, making frontend error handling predictable and enabling centralized monitoring."

#### What does a reverse proxy do before the app receives the request?
- **The Engine Mechanism (Why it behaves this way):** A reverse proxy like Nginx or Envoy sits between clients and the application server. It terminates TLS (decrypts HTTPS), routes requests based on host/path headers, compresses responses, serves static files directly, buffers slow clients, adds headers (X-Request-ID, X-Forwarded-For), enforces connection limits, and can perform basic rate limiting. The app server receives already-decrypted HTTP with enriched headers, never handling TLS certificates or static file serving.
- **The Unforgettable Mental Model:** The **Building Lobby**. Before you reach any office, the lobby handles security badges (TLS), directs you to the right floor (routing), stores packages (static files), and manages visitor logs (headers). The offices only deal with actual work.
- **The Trap:** Thinking the app server handles TLS directly in production. In most architectures, TLS terminates at the reverse proxy or load balancer, and the app server receives plain HTTP on an internal network.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A reverse proxy acts as the public-facing entry point for backend services. It terminates TLS connections, routes requests to the appropriate internal service based on host or path, serves static assets directly, compresses responses, buffers slow clients to protect the app server, and adds metadata headers like request IDs and forwarded IPs. The application server receives clean HTTP requests with enriched context, offloading infrastructure concerns to the proxy layer."

#### How do you trace one request across services?
- **The Engine Mechanism (Why it behaves this way):** Distributed tracing assigns a unique correlation ID (trace ID) to each incoming request, typically generated at the reverse proxy or first middleware. This ID is attached to the request object, included in all log entries, passed to downstream services via headers (X-Request-ID or W3C Trace Context), and propagated through database queries and external API calls. Tracing systems like OpenTelemetry collect spans from each service, building a complete timeline of the request's journey.
- **The Unforgettable Mental Model:** The **Package Tracking Number**. From the moment a package enters the shipping system, one tracking number follows it through every warehouse, truck, and delivery person. You can see exactly where it is and how long each step took.
- **The Trap:** Generating different log IDs at each service instead of propagating one ID. Without a shared correlation ID, debugging a request that spans multiple services becomes impossible — you're searching for needles in separate haystacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement distributed tracing by generating a unique correlation ID at the entry point — usually the reverse proxy or first middleware — and propagating it through the entire request chain. This ID is attached to every log entry, passed to downstream services via headers like X-Request-ID or the W3C Trace Context standard, and included in database queries and external API calls. With OpenTelemetry or similar, each service emits spans that combine into a complete trace, letting me see exactly where a request spent its time across the entire system."

## 8. Active recall test

1. **What is the complete path of an HTTP request from browser to database and back?**
   - **Explanation:** DNS resolution → TCP handshake → TLS negotiation → CDN/reverse proxy → backend server → middleware (logging, CORS, auth, parsing, validation) → route handler → service layer → database/cache → response serialization → back through middleware → reverse proxy → TLS → TCP → browser.

2. **Where do CORS, auth, validation, and rate limiting run in the pipeline?**
   - **Explanation:** All run as middleware before the route handler. CORS typically runs first (so browsers get preflight responses), then auth (to reject unauthenticated requests early), then validation (to reject bad input), then rate limiting (to protect against abuse). Order matters.

3. **What should a controller do and not do?**
   - **Explanation:** A controller should parse the request, call the service layer, and serialize the response. It should NOT contain business logic, database queries, email sending, or complex validation. Controllers are the HTTP transport layer; services are the domain logic layer.

4. **Why should response serialization be explicit?**
   - **Explanation:** Raw database models contain sensitive fields (passwords, internal IDs, soft-delete flags), implementation details, and unstable shapes. Explicit serialization ensures only intended fields are exposed, maintains a stable API contract, prevents data leaks, and allows different response shapes for different contexts (admin vs. public).

## 9. Mistakes / traps

- Thinking the route handler is the whole lifecycle.
- Putting all logic inside controllers.
- Returning raw database models directly.
- Handling errors differently in every endpoint.
- Logging sensitive request bodies.

## 10. Compare with related concepts

It is not the same as REST. REST is an API design style; request lifecycle is how any backend processes a request. It is not the same as middleware either; middleware is only one stage in the lifecycle.

## 11. Summary from memory

Explain the full journey of one authenticated API request from browser to backend to database and back.

## 12. Spaced revision prompts

- Day 1: Draw the lifecycle from memory.
- Day 3: Explain where auth and validation happen.
- Day 7: Explain how an error becomes a JSON response.
- Day 14: Explain how tracing follows one request across services.

