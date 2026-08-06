# How do you handle auth from React to backend

## Detailed explanation

How do you handle auth from React to backend is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle auth from react to backend affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you send authentication from React to the backend?
- **The Engine Mechanism (Why it behaves this way):** Authentication is sent via HTTP headers, most commonly the `Authorization` header with a Bearer token (`Authorization: Bearer <token>`). The token is obtained during login, stored securely (httpOnly cookie or memory), and attached to every subsequent request. The backend validates the token's signature, expiration, and claims before processing the request.
- **The Unforgettable Mental Model:** The **VIP Wristband**. When you check in at the front desk (login), you get a wristband (token). Every time you enter a restricted area (protected endpoint), the bouncer (middleware) checks your wristband — is it valid, not expired, and does it grant access to this area?
- **The Trap:** Storing JWTs in localStorage. localStorage is accessible to any JavaScript on the page, making it vulnerable to XSS attacks. An attacker who injects script can steal all tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I send authentication via the Authorization header with a Bearer token scheme. The token is obtained during login and attached to every request through an HTTP client interceptor. For storage, I prefer httpOnly cookies when possible since they're not accessible to JavaScript and protected from XSS. If using localStorage is unavoidable, I implement strict CSP headers and sanitize all user inputs to minimize XSS risk."

#### Where should you store tokens on the frontend?
- **The Engine Mechanism (Why it behaves this way):** Token storage involves trade-offs between security and convenience. httpOnly cookies are secure against XSS but vulnerable to CSRF. localStorage is convenient but vulnerable to XSS. sessionStorage is slightly better than localStorage (cleared on tab close) but still XSS-vulnerable. Memory storage (React state) is most secure but lost on refresh.
- **The Unforgettable Mental Model:** The **Safe Deposit Box Spectrum**. httpOnly cookie = bank vault (most secure, but the bank controls access). Memory = your pocket (secure from thieves, but you can forget it). localStorage = under the doormat (convenient, but anyone can look).
- **The Trap:** Thinking httpOnly cookies solve everything. They prevent XSS token theft but introduce CSRF risk, requiring SameSite attributes and CSRF tokens for state-changing requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The ideal storage is httpOnly, Secure, SameSite=Strict cookies — they're inaccessible to JavaScript and automatically sent with requests. For SPAs on different domains, I use a hybrid: access token in memory (React state/Context) and refresh token in an httpOnly cookie. This limits XSS exposure since the access token vanishes on page refresh, and the refresh token is protected from script access."

#### How do you attach tokens to every API request?
- **The Engine Mechanism (Why it behaves this way):** Tokens are attached via HTTP client interceptors — functions that run before each request is sent. Axios uses `axios.interceptors.request.use()`, fetch can be wrapped in a custom function. The interceptor reads the token from storage and sets the `Authorization` header. This centralizes auth logic so no component needs to manually add headers.
- **The Unforgettable Mental Model:** The **Airport Security Checkpoint**. Every passenger (request) goes through the same checkpoint (interceptor) before boarding. The checkpoint verifies your ID (token), stamps your boarding pass (adds header), and only then lets you through.
- **The Trap:** Reading token from localStorage synchronously in every component. This duplicates code, is error-prone, and makes it hard to implement token refresh logic centrally.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use request interceptors to attach tokens centrally. With Axios, I configure a request interceptor that reads the token and sets the Authorization header. With fetch, I create a wrapper function that does the same. This way, every API call automatically includes auth, and I have a single place to implement token refresh logic when the token expires."

#### What happens when the backend returns 401 Unauthorized?
- **The Engine Mechanism (Why it behaves this way):** A 401 response means the server doesn't recognize or accept the provided credentials. The frontend should handle this by: (1) clearing invalid tokens, (2) attempting token refresh if a refresh token exists, (3) redirecting to login if refresh fails, and (4) queueing failed requests during refresh to replay them with the new token.
- **The Unforgettable Mental Model:** The **Expired ID Card**. Your ID (token) expired at the building entrance (401). You have two options: use your renewal receipt (refresh token) to get a new ID, or go back to the DMV (login page) if your renewal is also expired.
- **The Trap:** Immediately redirecting to login on every 401 without attempting token refresh. This logs out users unnecessarily when their access token expired but their refresh token is still valid.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: On a 401, I use a response interceptor to handle it globally. First, I check if a refresh token is available. If so, I call the refresh endpoint, update the stored token, and replay the original request with the new token. If refresh fails, I clear all auth state and redirect to login. I also implement request queuing so concurrent requests during refresh don't each trigger their own refresh call."

#### How do you handle CSRF when using cookies for auth?
- **The Engine Mechanism (Why it behaves this way):** CSRF attacks exploit the fact that browsers automatically send cookies with requests. An attacker's site can trigger a request to your backend, and the browser includes the auth cookie. Defenses include: SameSite cookie attribute, CSRF tokens (double-submit cookie pattern), and checking the Origin/Referer headers.
- **The Unforgettable Mental Model:** The **Secret Handshake**. SameSite cookies = the bouncer only accepts handshakes from inside the club. CSRF tokens = you need to know today's secret password (token in header) in addition to showing your ID (cookie).
- **The Trap:** Relying only on SameSite=Strict. While effective, it breaks cross-site flows like OAuth callbacks and payment redirects. SameSite=Lax with CSRF tokens is the balanced approach.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a layered CSRF defense. First, I set cookies with SameSite=Lax to block most cross-site requests while allowing top-level navigation. Second, I implement the double-submit CSRF pattern — the backend sends a CSRF token in a readable cookie, and the frontend must include that same token in a custom header (X-CSRF-Token) for state-changing requests. Since attackers can't read cookies from other domains, they can't forge the header value."

#### How do you implement role-based access on the frontend?
- **The Engine Mechanism (Why it behaves this way):** Role-based access on the frontend uses the user's role/permissions (from the JWT or user profile) to conditionally render UI elements and guard routes. A permission check utility evaluates whether the current user has the required role. However, frontend checks are UX-only — the backend must enforce authorization independently.
- **The Unforgettable Mental Model:** The **Theme Park Map**. The map (frontend UI) only shows rides you're tall enough to ride (roles). But the actual height check happens at each ride entrance (backend authorization) — the map is just a convenience.
- **The Trap:** Relying solely on frontend role checks for security. Frontend checks are for UX — hiding buttons the user can't use. The backend must always validate permissions since frontend code can be modified.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement frontend role checks as a UX layer, not a security layer. I store the user's roles in auth state and create a `hasPermission()` utility that components use to conditionally render buttons, links, and routes. Route guards check permissions before rendering protected pages. But critically, I emphasize that every backend endpoint must independently validate authorization — frontend checks are purely for user experience, never for security."

#### What would you monitor for authentication in production?
- **The Engine Mechanism (Why it behaves this way):** Auth monitoring tracks login success/failure rates, token refresh failure rates, 401/403 error rates, session duration distributions, and suspicious patterns (multiple failed logins from same IP, token reuse after logout). These metrics detect both user experience issues and security threats.
- **The Unforgettable Mental Model:** The **Castle Gate Logs**. How many people entered successfully (login rate), how many were turned away (failures), how many tried to sneak in with fake passes (invalid tokens), and whether anyone's trying to pick the lock (brute force patterns).
- **The Trap:** Only tracking login failures. Token refresh failures are equally important — they cause unexpected logouts and are often the first sign of clock skew issues, key rotation problems, or database connectivity issues.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor auth across several dimensions: login success/failure rates to detect credential issues, token refresh failure rates which cause unexpected logouts, 401/403 rates by endpoint to find permission misconfigurations, and session duration distributions. I also set up alerts for security patterns — brute force attempts (many failures from one IP), token reuse after logout (potential token theft), and abnormal geographic login patterns."

## 8. Active recall test

1. **Why is httpOnly cookie storage preferred over localStorage for tokens?**
   - **Explanation:** httpOnly cookies are inaccessible to JavaScript, making them immune to XSS token theft. localStorage can be read by any script on the page, so an XSS vulnerability exposes all stored tokens. httpOnly cookies do introduce CSRF risk, which must be mitigated with SameSite attributes and CSRF tokens.

2. **How do request interceptors simplify auth handling?**
   - **Explanation:** Interceptors run automatically before every request, attaching the auth token to the Authorization header centrally. This eliminates the need for each component to manually add headers, provides a single place for token refresh logic, and ensures consistent auth behavior across all API calls.

3. **What is the correct flow when receiving a 401 response?**
   - **Explanation:** (1) Intercept the 401 in a response interceptor. (2) Check if a valid refresh token exists. (3) If yes, call the refresh endpoint, store the new token, and replay the original request. (4) If refresh fails, clear auth state and redirect to login. (5) Queue concurrent requests during refresh to avoid multiple refresh calls.

4. **What is the double-submit CSRF pattern?**
   - **Explanation:** The backend sends a CSRF token in a readable (non-httpOnly) cookie. The frontend reads this token and includes it in a custom header (X-CSRF-Token) for state-changing requests. Since attackers can't read cookies from other domains due to same-origin policy, they can't forge the header value, blocking CSRF attacks.

5. **Why are frontend role checks not a security measure?**
   - **Explanation:** Frontend code runs on the user's browser and can be modified by anyone with developer tools. Role checks on the frontend are purely for UX — hiding UI elements the user can't access. Real security requires the backend to independently validate permissions on every request, since backend code is not under the user's control.

6. **What is the hybrid token storage strategy?**
   - **Explanation:** Store the short-lived access token in memory (React state/Context) and the long-lived refresh token in an httpOnly cookie. This limits XSS exposure since the access token disappears on page refresh, while the refresh token remains protected from JavaScript access. The access token is refreshed silently using the httpOnly cookie.

7. **Which auth metric is the earliest warning sign of production issues?**
   - **Explanation:** Token refresh failure rate. When refresh starts failing, users will be logged out unexpectedly on their next API call. This often precedes visible user complaints and can indicate clock skew between servers, key rotation issues, database connectivity problems, or expired signing keys.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle auth from React to backend in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle auth from React to backend in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
