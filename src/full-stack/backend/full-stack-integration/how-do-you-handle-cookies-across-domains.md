# How do you handle cookies across domains

## Detailed explanation

How do you handle cookies across domains is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle cookies across domains affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### Why can't cookies be shared across different domains?
- **The Engine Mechanism (Why it behaves this way):** Cookies are bound by the same-origin policy. A cookie set by `api.example.com` is only sent to requests to `api.example.com`, not to `app.example.com` or `other-domain.com`. This is a fundamental browser security feature that prevents one domain from accessing another domain's authentication state. The `Domain` attribute can share cookies across subdomains (`.example.com` covers all subdomains), but never across completely different domains.
- **The Unforgettable Mental Model:** The **Hotel Key Card System**. Your key card (cookie) works only in your hotel (domain). It won't open doors at the hotel across the street (different domain). Even if both hotels are part of the same chain (subdomains of the same parent domain), you need a special master key (`.example.com` domain attribute) to access both.
- **The Trap:** Trying to set a cookie for a domain you don't control. Browsers ignore `Set-Cookie` headers where the `Domain` attribute doesn't match the response's origin. You can't set a cookie for `google.com` from `your-site.com`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Cookies are bound by the same-origin policy — a cookie set by one domain is only sent to that domain. The `Domain` attribute can extend cookies to subdomains (`.example.com` covers `api.example.com` and `app.example.com`), but never across different top-level domains. This is a core browser security feature. For cross-domain auth, I use alternative approaches: token-based auth with Authorization headers, a shared auth domain, or a backend proxy that unifies the origin."

#### How do you share cookies across subdomains?
- **The Engine Mechanism (Why it behaves this way):** To share cookies across subdomains, set the `Domain` attribute to the parent domain with a leading dot: `Domain=.example.com`. This makes the cookie available to `api.example.com`, `app.example.com`, `www.example.com`, and any other subdomain. The cookie must also be set with `Secure` flag (HTTPS only) and appropriate `SameSite` attribute. Both frontend and backend must be subdomains of the same parent domain.
- **The Unforgettable Mental Model:** The **Family Trust Fund**. The parent domain (.example.com) is the family trust. All family members (subdomains) can access it. Outsiders (different domains) cannot. The leading dot is the family name that grants access to all members.
- **The Trap:** Forgetting the leading dot in the Domain attribute. `Domain=example.com` (without dot) works in modern browsers but is technically non-standard. `Domain=.example.com` is the correct format for subdomain sharing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I share cookies across subdomains by setting `Domain=.example.com` in the Set-Cookie header. This makes the cookie available to all subdomains — `api.example.com`, `app.example.com`, etc. I also set `Secure` (HTTPS only), `SameSite=Lax` or `Strict` (CSRF protection), and `HttpOnly` (XSS protection). The requirement is that both frontend and backend must be subdomains of the same parent domain. If they're on different domains entirely, this approach won't work."

#### How do you handle auth when frontend and backend are on completely different domains?
- **The Engine Mechanism (Why it behaves this way):** When frontend (`app.com`) and backend (`api.com`) are on different domains, cookies can't be shared. Solutions include: (1) Token-based auth — store the access token in memory and send via Authorization header, with refresh token in an httpOnly cookie on the API domain. (2) Backend proxy — the frontend dev server or a reverse proxy routes API requests through the frontend's domain, making them same-origin. (3) Shared auth domain — create `auth.example.com` that both domains use for authentication via redirects.
- **The Unforgettable Mental Model:** The **International Mail System**. Two countries (different domains) can't share a domestic postal system (cookies). They use international mail (Authorization headers with tokens), a diplomatic pouch (backend proxy), or a neutral embassy (shared auth domain) for communication.
- **The Trap:** Trying to force cross-domain cookies with CORS credentials. While technically possible with `credentials: 'include'`, it requires complex CORS configuration and has limitations with third-party cookie restrictions in modern browsers (ITP, ETP).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For different domains, I use token-based auth with the access token in memory and the refresh token in an httpOnly cookie on the API domain. The frontend sends the access token via the Authorization header. For the refresh flow, the frontend calls the API domain's refresh endpoint with `credentials: 'include'` — the httpOnly cookie is sent because the request goes directly to the API domain. This avoids cross-domain cookie issues while maintaining security. Alternatively, I use a reverse proxy to unify origins."

#### What are third-party cookie restrictions and how do they affect cross-domain auth?
- **The Engine Mechanism (Why it behaves this way):** Modern browsers (Safari's ITP, Firefox's ETP, Chrome's upcoming phase-out) block or restrict third-party cookies — cookies set by a domain different from the one in the address bar. When the frontend is on `app.com` and makes a request to `api.com`, the `api.com` cookie is considered third-party and may be blocked. This breaks cross-domain cookie-based auth. Solutions include using the Storage Access API, backend proxies, or token-based auth.
- **The Unforgettable Mental Model:** The **No-Visitor Policy**. The browser (building) used to let visitors (third-party cookies) from other companies (api.com) into your office (app.com). Now the building has a no-visitor policy — only people from your own company (first-party cookies) are allowed in.
- **The Trap:** Assuming cross-domain cookies work in all browsers. Safari has blocked third-party cookies by default for years, Firefox blocks them in strict mode, and Chrome is phasing them out. Cross-domain cookie auth is increasingly unreliable.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Third-party cookie restrictions in Safari, Firefox, and upcoming Chrome block cookies set by domains different from the address bar. This breaks cross-domain cookie auth. I address this by: using token-based auth (access token in memory, Authorization header), implementing a backend proxy to unify origins, or using the Storage Access API for explicit user consent. I design auth to work without third-party cookies from the start, since the industry is moving toward complete third-party cookie elimination."

#### How do you use a backend proxy to solve cross-domain cookie issues?
- **The Engine Mechanism (Why it behaves this way):** A backend proxy (nginx, Vite dev proxy, or API gateway) routes API requests through the frontend's domain. The browser sends requests to `app.com/api/users`, and the proxy forwards them to `api.com/api/users`. Since the browser communicates only with `app.com`, all cookies are first-party. The proxy adds the backend's auth cookies to forwarded requests and strips them from responses to set them under the frontend's domain.
- **The Unforgettable Mental Model:** The **Translator at the Border**. Two people speak different languages (different domains). The translator (proxy) stands between them, converting messages so each person thinks they're talking to someone who speaks their language (same origin).
- **The Trap:** Not forwarding authentication headers through the proxy. The proxy must pass through Authorization headers and cookies between the browser and backend, or auth will break.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a reverse proxy (nginx or the framework's built-in proxy) to route API requests through the frontend's domain. The browser sends requests to `app.com/api/*`, and the proxy forwards them to the backend at `api.com`. Since the browser only sees `app.com`, all cookies are first-party and不受 third-party restrictions. The proxy handles header forwarding, cookie rewriting, and CORS elimination. This is the cleanest solution for cross-domain setups."

#### How do you test cross-domain cookie behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing cross-domain cookies requires a setup that mimics the production domain configuration. Use local domain aliases in `/etc/hosts` (e.g., `127.0.0.1 app.test api.test`) with self-signed HTTPS certificates. Test in multiple browsers to verify third-party cookie behavior. Verify cookies are set with correct Domain, Path, Secure, SameSite, and HttpOnly attributes. Test the full auth flow: login, cookie persistence across pages, token refresh, and logout.
- **The Unforgettable Mental Model:** The **Flight Simulator for Cross-Domain**. You can't test international flight (cross-domain) on a local runway (localhost). You need a simulator that recreates the actual conditions — different domains, HTTPS, browser restrictions.
- **The Trap:** Testing cross-domain cookies on localhost. localhost has special cookie handling rules that don't match production behavior. Use real domain aliases with HTTPS for accurate testing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test cross-domain cookies using local domain aliases in `/etc/hosts` with self-signed HTTPS certificates — `app.test` and `api.test` pointing to 127.0.0.1. This mimics production domain separation. I test in multiple browsers (Chrome, Safari, Firefox) to verify third-party cookie behavior. I verify cookie attributes (Domain, Secure, SameSite, HttpOnly) and test the full auth flow: login sets cookies, cookies persist across navigation, refresh works, and logout clears them. I never test cross-domain cookies on localhost alone since its behavior differs from production."

#### What would you monitor for cross-domain cookies in production?
- **The Engine Mechanism (Why it behaves this way):** Cross-domain cookie monitoring tracks auth failure rates by browser (Safari vs Chrome), third-party cookie rejection rates, cookie attribute validation failures, and auth flow completion rates. These metrics reveal whether third-party cookie restrictions are causing auth failures and whether cookie configuration is correct across all browsers.
- **The Unforgettable Mental Model:** The **Border Crossing Statistics**. How many travelers (auth requests) successfully cross the border (set cookies), which checkpoints (browsers) are most restrictive, and whether the travel documents (cookie attributes) are in order.
- **The Trap:** Only monitoring overall auth failure rate without breaking it down by browser. Safari's third-party cookie blocking causes auth failures that Chrome doesn't have — aggregate metrics hide this disparity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor auth failure rates broken down by browser to detect third-party cookie issues — Safari typically has higher failure rates due to ITP. I track third-party cookie rejection rates, cookie attribute validation failures, and auth flow completion rates. I also monitor the ratio of cookie-based auth to header-based auth failures. If Safari users have significantly higher auth failure rates, it signals that third-party cookie restrictions are impacting our cross-domain auth, and I need to implement an alternative approach."

## 8. Active recall test

1. **Why can't cookies be shared across different top-level domains?**
   - **Explanation:** Cookies are bound by the same-origin policy. A cookie set by one domain is only sent to that domain. The Domain attribute can share cookies across subdomains (.example.com) but never across different top-level domains (example.com vs other.com). This is a fundamental browser security feature.

2. **How do you share cookies across subdomains like api.example.com and app.example.com?**
   - **Explanation:** Set the cookie's Domain attribute to `.example.com` (with leading dot). This makes the cookie available to all subdomains. Also set Secure (HTTPS only), HttpOnly (XSS protection), and SameSite (CSRF protection) attributes.

3. **What is the recommended auth approach when frontend and backend are on different domains?**
   - **Explanation:** Token-based auth: store access token in memory, send via Authorization header. Store refresh token in an httpOnly cookie on the API domain. The frontend calls the API domain's refresh endpoint directly (with credentials: 'include') since the request goes to the cookie's domain.

4. **How do third-party cookie restrictions affect cross-domain auth?**
   - **Explanation:** Browsers like Safari (ITP), Firefox (ETP), and Chrome (phasing out) block cookies set by domains different from the address bar. When frontend is on app.com and backend on api.com, the api.com cookie is third-party and may be blocked, breaking cookie-based auth.

5. **How does a backend proxy solve cross-domain cookie issues?**
   - **Explanation:** The proxy routes API requests through the frontend's domain. Browser sends to app.com/api/*, proxy forwards to api.com. Since the browser only communicates with app.com, all cookies are first-party and不受 third-party restrictions. CORS is also eliminated.

6. **Why shouldn't you test cross-domain cookies on localhost?**
   - **Explanation:** localhost has special cookie handling rules that don't match production behavior. Use local domain aliases (/etc/hosts) with self-signed HTTPS certificates (app.test, api.test) to accurately mimic production domain separation and third-party cookie restrictions.

7. **Which browser metric is most important for cross-domain cookie monitoring?**
   - **Explanation:** Auth failure rate broken down by browser. Safari typically has higher failure rates due to Intelligent Tracking Prevention (ITP) blocking third-party cookies. Comparing Safari vs Chrome failure rates reveals whether third-party cookie restrictions are impacting auth.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle cookies across domains in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle cookies across domains in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
