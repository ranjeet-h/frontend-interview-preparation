# How do you handle CORS in local development

## Detailed explanation

How do you handle CORS in local development is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Make frontend and backend agree on auth, data contracts, errors, retries, and state.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define frontend-backend contract.
- Handle auth, cookies/tokens, CORS, and errors.
- Prevent duplicate or stale requests.
- Map backend validation to frontend UX.
- Keep contracts versioned and testable.

## 4. Visual / analogy

```txt
React UI -> API client -> backend endpoint -> response/error contract -> UI state
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply full-stack integration rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle cors in local development affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is CORS and why does it block local development?
- **The Engine Mechanism (Why it behaves this way):** CORS (Cross-Origin Resource Sharing) is a browser security mechanism that restricts cross-origin HTTP requests. An origin is the combination of protocol, domain, and port. During local development, the frontend runs on `localhost:3000` and the backend on `localhost:8000` — different ports means different origins. The browser blocks the request unless the backend includes `Access-Control-Allow-Origin` headers permitting the frontend's origin.
- **The Unforgettable Mental Model:** The **Office Building Security**. Each office (origin) has its own badge system. You can't walk from Office A (localhost:3000) into Office B (localhost:8000) unless Office B's security (CORS headers) explicitly allows visitors from Office A. Same building (localhost), different offices (ports) = different origins.
- **The Trap:** Thinking CORS is a backend security feature. CORS is a browser-enforced policy — it only affects requests from browsers. Server-to-server requests, curl, and Postman bypass CORS entirely. CORS protects users from malicious websites, not servers from unauthorized access.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: CORS is a browser security mechanism that restricts cross-origin requests. During local development, the frontend and backend run on different ports, which the browser treats as different origins. The browser blocks cross-origin requests unless the backend responds with appropriate CORS headers. I configure the backend to allow `localhost:3000` in development, and the specific production domain in production. Importantly, CORS is browser-only — it doesn't protect against server-to-server attacks."

#### How do you configure CORS for local development?
- **The Engine Mechanism (Why it behaves this way):** In development, the backend's CORS middleware is configured to allow the frontend's dev server origin. For Express: `cors({ origin: 'http://localhost:3000', credentials: true })`. For FastAPI: `CORSMiddleware(allow_origins=['http://localhost:3000'], allow_credentials=True)`. The configuration includes allowed methods (GET, POST, etc.), allowed headers (Content-Type, Authorization), and whether credentials (cookies) are allowed.
- **The Unforgettable Mental Model:** The **Guest List**. The bouncer (CORS middleware) has a list of allowed origins. In development, `localhost:3000` is on the list. In production, the actual domain is on the list. Anyone not on the list gets turned away at the door.
- **The Trap:** Using `origin: '*'` (allow all) in development with `credentials: true`. This combination is invalid — browsers reject wildcard origins when credentials are involved. Always specify the exact origin.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I configure CORS in the backend's development environment to explicitly allow the frontend's dev server origin — `http://localhost:3000` for React. I set allowed methods (GET, POST, PUT, DELETE, OPTIONS), allowed headers (Content-Type, Authorization), and `credentials: true` if using cookies. I never use wildcard `*` with credentials since browsers reject that combination. The CORS config is environment-specific — development allows localhost, production allows the actual domain."

#### What is a CORS preflight request?
- **The Engine Mechanism (Why it behaves this way):** For "non-simple" requests (methods other than GET/POST/HEAD, or with custom headers like Authorization, or with Content-Type other than form-encoded), the browser first sends an OPTIONS request (preflight) to check if the actual request is allowed. The backend responds with CORS headers indicating allowed methods, headers, and origins. If the preflight succeeds, the browser sends the actual request. If it fails, the actual request is never sent.
- **The Unforgettable Mental Model:** The **Security Checkpoint**. Before entering a secure area (making the actual request), you go through a checkpoint (preflight OPTIONS). The guard checks your credentials and tells you what you're allowed to bring in (allowed methods/headers). If the checkpoint passes, you proceed. If not, you're stopped before even trying.
- **The Trap:** Not handling OPTIONS requests in the backend. If the backend doesn't respond to OPTIONS with proper CORS headers, the preflight fails and the actual request is never sent, even if the backend would have accepted it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A preflight is an OPTIONS request the browser sends before non-simple requests to verify CORS permissions. Non-simple requests include those with custom headers (Authorization), non-standard methods (PUT, DELETE), or non-form Content-Types. The backend must respond to OPTIONS with `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`, and `Access-Control-Allow-Origin`. Most CORS libraries handle this automatically, but if you're writing custom middleware, you must explicitly handle OPTIONS requests."

#### How do you proxy API requests to avoid CORS in development?
- **The Engine Mechanism (Why it behaves this way):** Instead of configuring CORS, you can configure the frontend dev server to proxy API requests to the backend. The browser sends requests to `localhost:3000/api/users` (same origin), and the dev server forwards them to `localhost:8000/api/users`. Since the browser sees only same-origin requests, CORS doesn't apply. In Vite: `server.proxy: { '/api': 'http://localhost:8000' }`. In Create React App: `"proxy": "http://localhost:8000"` in package.json.
- **The Unforgettable Mental Model:** The **Mail Forwarding Service**. Instead of mailing directly to a different address (cross-origin), you mail to your local post office (dev server), which forwards it to the destination. The sender (browser) only interacts with the local post office — no cross-origin issues.
- **The Trap:** Forgetting that proxying only works in development. Production deployments need proper CORS configuration or a reverse proxy (nginx) since the dev server proxy isn't available in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use the dev server's proxy feature to avoid CORS in development. In Vite, I configure `server.proxy` to forward `/api` requests to the backend. The browser sends same-origin requests to the dev server, which proxies them to the backend. This eliminates CORS entirely in development since the browser only sees same-origin requests. For production, I use a reverse proxy like nginx or configure proper CORS headers — the dev proxy is development-only."

#### How do you handle CORS with cookies (credentials)?
- **The Engine Mechanism (Why it behaves this way):** When using httpOnly cookies for auth, CORS must be configured with `credentials: true` on both backend and frontend. The backend sets `Access-Control-Allow-Credentials: true` and specifies the exact origin (not wildcard). The frontend sets `fetch(url, { credentials: 'include' })` or `axios.defaults.withCredentials = true`. This allows the browser to send cookies with cross-origin requests.
- **The Unforgettable Mental Model:** The **Trusted Courier**. Regular requests travel without identification (no cookies). Credential requests travel with a trusted courier (cookies) that proves your identity. The backend must explicitly trust the courier source (exact origin, not wildcard) for this to work.
- **The Trap:** Using `Access-Control-Allow-Origin: '*'` with `Access-Control-Allow-Credentials: true`. Browsers reject this combination. You must specify the exact origin when credentials are involved.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For cookie-based auth with CORS, I set `credentials: true` on both sides. The backend configures `Access-Control-Allow-Credentials: true` with the exact frontend origin (never wildcard). The frontend sets `credentials: 'include'` in fetch or `withCredentials: true` in Axios. This allows the browser to send httpOnly cookies with cross-origin requests. The key constraint: when credentials are enabled, the origin must be explicitly specified — wildcards are rejected by the browser."

#### How do you debug CORS errors in the browser?
- **The Engine Mechanism (Why it behaves this way):** CORS errors appear in the browser console with messages like "Access to fetch at X from origin Y has been blocked by CORS policy." The error message specifies which header is missing or mismatched. Debugging steps: (1) check the Network tab for the preflight OPTIONS response, (2) verify `Access-Control-Allow-Origin` matches the request origin, (3) check `Access-Control-Allow-Methods` and `Access-Control-Allow-Headers` for the actual request, (4) verify credentials configuration.
- **The Unforgettable Mental Model:** The **Error Receipt**. When a request is blocked, the browser hands you a receipt (console error) that says exactly why — missing header, wrong origin, disallowed method. Read the receipt, fix the specific issue, and try again.
- **The Trap:** Looking at the actual request's response instead of the preflight OPTIONS response. CORS errors are determined by the preflight response, not the actual request. The actual request may never have been sent.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I debug CORS errors by checking the browser's Network tab for the preflight OPTIONS request. I verify: the `Access-Control-Allow-Origin` header matches the frontend's origin, `Access-Control-Allow-Methods` includes the request method, `Access-Control-Allow-Headers` includes any custom headers, and `Access-Control-Allow-Credentials` is set if using cookies. The console error message usually tells me exactly which check failed. I also check that the backend's CORS middleware is actually enabled and not overridden by other middleware."

#### What would you monitor for CORS in production?
- **The Engine Mechanism (Why it behaves this way):** CORS monitoring tracks CORS error rates from frontend error tracking (Sentry), preflight failure rates, and origin mismatch incidents. These metrics reveal deployment issues (wrong CORS origin configured), new client domains that need to be added, or misconfigured CDN/proxy setups.
- **The Unforgettable Mental Model:** The **Border Crossing Log**. It tracks how many travelers (requests) were turned away at the border (CORS blocked), which countries they came from (origins), and why they were rejected (missing headers, wrong origin).
- **The Trap:** Not monitoring CORS errors in production. A deployment that changes the frontend domain without updating the backend's CORS config causes immediate breakage for all users. CORS errors should trigger alerts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor CORS errors through frontend error tracking (Sentry) — CORS failures appear as fetch/network errors. I track preflight failure rates and origin mismatch incidents. I set up alerts for CORS error spikes, which often indicate deployment issues: a new frontend domain wasn't added to the backend's CORS allowlist, or a CDN/proxy configuration changed the origin header. CORS errors in production mean users can't use the app at all, so they're high-priority alerts."

## 8. Active recall test

1. **Why does CORS block requests between localhost:3000 and localhost:8000?**
   - **Explanation:** CORS treats different ports as different origins. `localhost:3000` and `localhost:8000` have the same domain but different ports, so the browser considers them cross-origin. The backend must include `Access-Control-Allow-Origin: http://localhost:3000` to permit the cross-origin request.

2. **What triggers a CORS preflight request?**
   - **Explanation:** Non-simple requests trigger preflights: methods other than GET/POST/HEAD, custom headers (Authorization, X-Custom-Header), or Content-Types other than `application/x-www-form-urlencoded`, `multipart/form-data`, or `text/plain`. The browser sends an OPTIONS request first to verify permissions.

3. **How do you avoid CORS entirely in local development?**
   - **Explanation:** Use the dev server's proxy feature. Configure Vite's `server.proxy` or CRA's `proxy` field to forward `/api` requests to the backend. The browser sends same-origin requests to the dev server, which proxies them to the backend. Since the browser only sees same-origin requests, CORS doesn't apply.

4. **Why can't you use `Access-Control-Allow-Origin: '*'` with credentials?**
   - **Explanation:** The browser security specification explicitly rejects this combination. When `Access-Control-Allow-Credentials: true` is set, the origin must be explicitly specified (e.g., `http://localhost:3000`). Wildcard origins with credentials would allow any website to make authenticated requests on behalf of the user.

5. **How do you send cookies with cross-origin requests from the frontend?**
   - **Explanation:** Set `credentials: 'include'` in fetch options or `withCredentials: true` in Axios. This tells the browser to include cookies with cross-origin requests. The backend must also set `Access-Control-Allow-Credentials: true` for the cookies to be accepted.

6. **What is the first thing to check when debugging a CORS error?**
   - **Explanation:** The preflight OPTIONS request in the browser's Network tab. Check its response headers: `Access-Control-Allow-Origin` must match the frontend origin, `Access-Control-Allow-Methods` must include the request method, and `Access-Control-Allow-Headers` must include any custom headers. The actual request may never have been sent if the preflight failed.

7. **What production event commonly causes CORS error spikes?**
   - **Explanation:** Deploying a new frontend domain or subdomain without updating the backend's CORS allowlist. For example, moving from `app.example.com` to `new-app.example.com` without adding the new origin to the backend's CORS configuration causes immediate CORS failures for all users.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle CORS in local development in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle CORS in local development in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
