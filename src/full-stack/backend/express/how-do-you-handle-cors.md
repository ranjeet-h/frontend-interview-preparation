# How do you handle CORS

## Detailed explanation

How do you handle CORS is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle cors by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle cors affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is CORS and how do you handle it in Express?
- **The Engine Mechanism (Why it behaves this way):** CORS (Cross-Origin Resource Sharing) is a browser security mechanism that blocks frontend JavaScript from making requests to a different origin (domain, protocol, or port) than the page was loaded from. The browser sends a preflight OPTIONS request before certain requests (POST with JSON, custom headers) to check if the server allows the cross-origin request. The server responds with CORS headers: `Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`. In Express, use the `cors` middleware: `app.use(cors({ origin: 'https://frontend.com', methods: ['GET', 'POST'], credentials: true }))`.
- **The Unforgettable Mental Model:** The **Border Checkpoint**. The browser is the border guard — it stops any traveler (request) going to a foreign country (different origin) and checks if the destination country has a visa agreement (CORS headers) with the traveler's home country.
- **The Trap:** Thinking CORS is a server-side security feature. It's a browser-enforced policy — server-to-server requests (curl, Postman, backend APIs) are not affected by CORS. Disabling CORS doesn't make your API insecure; proper auth does.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CORS is a browser security mechanism that restricts cross-origin HTTP requests from frontend JavaScript. I handle it in Express using the cors middleware, configured with specific allowed origins, methods, and headers. For production, I whitelist specific frontend domains rather than using wildcard (*). CORS is browser-enforced only — server-to-server requests aren't affected. The real security comes from authentication and authorization, not CORS."

#### What is a CORS preflight request?
- **The Engine Mechanism (Why it behaves this way):** Before sending certain "non-simple" requests, the browser automatically sends an OPTIONS request to check if the actual request is allowed. Non-simple requests include: methods other than GET/HEAD/POST, POST with Content-Type other than application/x-www-form-urlencoded, multipart/form-data, or text/plain, and requests with custom headers. The preflight includes `Access-Control-Request-Method` and `Access-Control-Request-Headers`. The server responds with allowed methods/headers via `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers`. The browser caches the preflight response (controlled by `Access-Control-Max-Age`).
- **The Unforgettable Mental Model:** The **Advance Scout**. Before the main army (actual request) marches in, a scout (preflight) goes ahead to check if the path is clear. If the scout gets approval, the army follows. If not, the army stays home.
- **The Trap:** Not handling OPTIONS requests in your routes. The cors middleware handles preflight automatically, but if you have custom route-level middleware that blocks OPTIONS, preflight fails. Also, preflight doesn't send cookies/auth headers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A preflight is an automatic OPTIONS request the browser sends before non-simple cross-origin requests. It asks the server what methods and headers are allowed. The cors middleware handles preflight automatically in Express. I make sure my middleware stack doesn't block OPTIONS requests, and I set Access-Control-Max-Age to cache preflight responses and reduce overhead. Preflight requests don't include authentication — they're just permission checks."

#### How do you configure CORS for multiple frontend domains?
- **The Engine Mechanism (Why it behaves this way):** The `cors` middleware accepts a function for dynamic origin checking: `app.use(cors({ origin: (origin, callback) => { const allowed = ['https://app.com', 'https://admin.app.com', 'https://localhost:3000']; if (!origin || allowed.includes(origin)) callback(null, true); else callback(new Error('Not allowed by CORS')); } }))`. The `!origin` check allows requests without an Origin header (server-to-server, curl). For development, include localhost. For production, use environment variables to configure allowed origins. Never use `origin: '*'` with `credentials: true` — browsers reject this combination.
- **The Unforgettable Mental Model:** The **Guest List**. The bouncer (CORS middleware) checks each visitor's ID (origin) against the guest list (allowed domains). If on the list, they enter. If not, they're turned away. Server-to-server requests (no ID) are always welcome.
- **The Trap:** Using `origin: '*'` (wildcard) in production — this allows any website to make requests to your API. Also, hardcoding origins instead of using environment variables for different environments.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a dynamic origin function that checks against a whitelist of allowed domains from environment variables. I include localhost for development and specific frontend domains for production. The function also allows requests without an Origin header for server-to-server calls. I never use wildcard origins in production, and I never combine wildcard with credentials: true since browsers reject it."

#### What CORS headers does the cors middleware set?
- **The Engine Mechanism (Why it behaves this way):** The cors middleware sets: (1) `Access-Control-Allow-Origin` — the allowed origin (specific domain or *). (2) `Access-Control-Allow-Methods` — allowed HTTP methods (GET, POST, etc.). (3) `Access-Control-Allow-Headers` — allowed request headers (Content-Type, Authorization, etc.). (4) `Access-Control-Allow-Credentials` — whether cookies/auth headers are allowed. (5) `Access-Control-Expose-Headers` — which response headers the browser can expose to JavaScript. (6) `Access-Control-Max-Age` — how long to cache preflight results. For preflight responses, it also sets `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` based on the request's `Access-Control-Request-*` headers.
- **The Unforgettable Mental Model:** The **Permission Slip**. Each header is a different permission: where you can go (Allow-Origin), what you can do (Allow-Methods), what you can bring (Allow-Headers), whether you can use your ID card (Allow-Credentials).
- **The Trap:** Not setting `Access-Control-Expose-Headers` when you need the frontend to read custom response headers. By default, browsers only expose simple headers (Cache-Control, Content-Language, Content-Type, Expires, Last-Modified, Pragma).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The cors middleware sets Allow-Origin, Allow-Methods, Allow-Headers, Allow-Credentials, Expose-Headers, and Max-Age. I configure Allow-Origin with specific domains, Allow-Methods with the HTTP methods my API supports, and Allow-Credentials: true when I need cookies. If my API returns custom headers that the frontend needs to read, I set Expose-Headers to list them — otherwise browsers hide them from JavaScript."

#### Does CORS protect your API from unauthorized access?
- **The Engine Mechanism (Why it behaves this way):** No. CORS is a browser-enforced policy, not a server-side security mechanism. It only prevents browsers from making cross-origin requests with JavaScript. Server-to-server requests (curl, Postman, other backends) bypass CORS entirely. An attacker can still make direct API calls, use proxy servers, or write scripts that don't enforce CORS. Real API security comes from authentication (JWT, sessions), authorization (roles, permissions), rate limiting, and input validation. CORS is a UX feature for browsers, not a security boundary.
- **The Unforgettable Mental Model:** The **"No Trespassing" Sign**. The sign (CORS) deters honest people from entering your property through the front door. But it doesn't stop someone from climbing the fence (direct API calls) or coming through the back (server-to-server requests).
- **The Trap:** Relying on CORS as a security measure. "My API is safe because CORS blocks other domains" is a dangerous misconception. Authentication and authorization are the real security layers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CORS does NOT protect your API from unauthorized access. It's a browser-enforced policy that only affects JavaScript running in browsers. Server-to-server requests, curl, Postman, and custom scripts bypass CORS entirely. Real API security requires authentication, authorization, rate limiting, and input validation. CORS is about controlling which browsers can make cross-origin requests, not about securing your API endpoints."

## 8. Active recall test

1. **What is CORS?**
   - **Explanation:** Cross-Origin Resource Sharing — a browser security mechanism that restricts frontend JavaScript from making HTTP requests to a different origin (domain, protocol, or port) than the page was loaded from.

2. **When does the browser send a CORS preflight request?**
   - **Explanation:** Before non-simple requests: methods other than GET/HEAD/POST, POST with non-standard Content-Type, or requests with custom headers. The preflight is an OPTIONS request checking server permissions.

3. **How do you allow multiple specific origins in Express?**
   - **Explanation:** Use a dynamic origin function: `origin: (origin, callback) => { const allowed = ['domain1', 'domain2']; callback(null, allowed.includes(origin)); }`. Never use wildcard in production.

4. **Can server-to-server requests bypass CORS?**
   - **Explanation:** Yes. CORS is only enforced by browsers. Server-side HTTP clients (curl, axios on backend, Postman) are not affected by CORS policies at all.

5. **Why can't you use origin: '*' with credentials: true?**
   - **Explanation:** Browsers reject this combination for security reasons. If credentials (cookies, auth headers) are allowed, the origin must be explicitly specified to prevent credential leakage to any domain.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle CORS in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle CORS in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
