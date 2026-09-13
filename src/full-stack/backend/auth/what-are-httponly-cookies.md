# What are HttpOnly cookies

## Detailed explanation

What are HttpOnly cookies is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what are httponly cookies by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply auth rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what are httponly cookies affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What are httpOnly cookies?
- **The Engine Mechanism (Why it behaves this way):** httpOnly is a cookie flag set by the server in the Set-Cookie header (e.g., `Set-Cookie: token=abc123; HttpOnly`). When this flag is present, the browser excludes the cookie from all JavaScript-accessible APIs: `document.cookie`, the Cookie Store API, and `XMLHttpRequest` response headers. The browser still automatically attaches the cookie to matching HTTP requests. This is enforced at the browser engine level, not by JavaScript.
- **The Unforgettable Mental Model:** The **Sealed Diplomatic Pouch**. The pouch (cookie) is delivered between embassies (browser and server) automatically, but no one along the route (JavaScript) is allowed to open it and read its contents. The seal is enforced by international law (browser engine), not by honor system.
- **The Trap:** Thinking httpOnly prevents the cookie from being sent with requests. It only prevents JavaScript access — the browser still sends the cookie automatically with matching requests. That's the whole point.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: httpOnly is a cookie flag that prevents JavaScript from accessing the cookie. It's set by the server in the Set-Cookie header and enforced by the browser engine. JavaScript cannot read, write, or modify httpOnly cookies through document.cookie or any other API. The browser still sends the cookie automatically with matching HTTP requests. This makes httpOnly cookies the recommended storage mechanism for authentication tokens because they're immune to XSS-based token theft."

#### How do you set an httpOnly cookie from the server?
- **The Engine Mechanism (Why it behaves this way):** The server includes the HttpOnly flag in the Set-Cookie response header. In Express: `res.cookie('token', value, { httpOnly: true, secure: true, sameSite: 'lax' })`. In Node.js raw: `res.setHeader('Set-Cookie', 'token=value; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400')`. The browser receives this header and stores the cookie with the specified flags.
- **The Unforgettable Mental Model:** The **Stamped Passport**. The issuing authority (server) stamps the passport (cookie) with specific restrictions (HttpOnly, Secure, SameSite). The border control (browser) enforces these restrictions automatically.
- **The Trap:** Forgetting the `secure` flag. httpOnly without secure means the cookie can be sent over unencrypted HTTP, exposing it to network interception. Always pair httpOnly with secure in production.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I set httpOnly cookies through the server's response headers. In Express, I use `res.cookie()` with the httpOnly, secure, and sameSite options. The key flags are: httpOnly (blocks JavaScript access), secure (HTTPS only), sameSite (CSRF protection), path (scope), and max-age or expires (lifetime). I never set auth cookies from the client side — they must come from the server with the proper security flags."

#### What can JavaScript NOT do with httpOnly cookies?
- **The Engine Mechanism (Why it behaves this way):** JavaScript cannot: read the cookie value via `document.cookie`, modify the cookie value, delete the cookie (can only request expiration via setting a past date, but can't directly delete httpOnly cookies), access the cookie through the Cookie Store API, or see the cookie in `XMLHttpRequest` or `fetch` response headers. The cookie is completely invisible to JavaScript.
- **The Unforgettable Mental Model:** The **Invisible Ink**. The message (cookie) is there, but JavaScript is colorblind to it. The browser can see it and act on it, but any script trying to read it sees nothing.
- **The Trap:** Trying to debug httpOnly cookies from the browser console. `document.cookie` won't show them. Use the browser's DevTools Application/Storage tab to inspect cookies, or check server logs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JavaScript cannot read, write, modify, or delete httpOnly cookies. They're invisible to document.cookie, the Cookie Store API, and fetch response headers. The only thing JavaScript can do is trigger requests that cause the browser to send the cookie automatically. This is intentional — it creates a security boundary where tokens are managed entirely by the browser and server, with JavaScript having zero access."

#### Do httpOnly cookies prevent CSRF?
- **The Engine Mechanism (Why it behaves this way):** No. httpOnly only prevents JavaScript access. CSRF exploits the fact that browsers automatically send cookies with cross-origin requests. Since httpOnly cookies are still sent automatically, they're vulnerable to CSRF. CSRF protection requires separate mechanisms: SameSite cookie attribute, anti-CSRF tokens, or custom header requirements.
- **The Unforgettable Mental Model:** The **Automatic Mail Delivery**. httpOnly puts the letter in a sealed envelope (JavaScript can't read it), but the mail carrier (browser) still delivers it to any address (including attacker-controlled forms via CSRF). You need a separate filter (SameSite, anti-CSRF tokens) to stop unwanted deliveries.
- **The Trap:** Assuming httpOnly = secure against all attacks. It only protects against XSS token theft. CSRF, network interception, and server-side vulnerabilities are separate concerns.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: httpOnly cookies do not prevent CSRF. They only prevent JavaScript access. CSRF works because browsers automatically send cookies with cross-origin requests, and httpOnly cookies are still sent automatically. To prevent CSRF, I use SameSite=Strict or Lax cookies, and for state-changing operations, I require anti-CSRF tokens or custom headers that browsers won't send in cross-origin requests. httpOnly and CSRF protection are complementary, not interchangeable."

#### What are the limitations of httpOnly cookies?
- **The Engine Mechanism (Why it behaves this way):** Limitations include: (1) Cannot be read by JavaScript (by design, but means the frontend can't check token expiry without a server round-trip), (2) Subject to browser cookie limits (~4KB per cookie, ~50 cookies per domain), (3) Cross-origin restrictions (cookies are domain-scoped), (4) CSRF vulnerability (mitigated by SameSite), (5) Third-party cookie blocking by browsers affects cross-domain auth flows.
- **The Unforgettable Mental Model:** The **Vending Machine with No Window**. You can't see what's inside (no JS access), you can only put in a limited size item (4KB limit), and it only works at specific locations (domain-scoped). But what's inside is safe from thieves.
- **The Trap:** Storing large JWTs in cookies. If the JWT exceeds 4KB, it may be truncated or rejected by the browser. Keep JWT payloads lean or use reference tokens instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: httpOnly cookies have several limitations: they're inaccessible to JavaScript (which is the security feature but means the frontend can't inspect token contents), they're limited to ~4KB per cookie, they're domain-scoped so cross-origin auth requires careful configuration, and they're vulnerable to CSRF without SameSite or anti-CSRF tokens. I also watch for browser third-party cookie deprecation, which affects cross-domain auth. For large JWTs, I keep payloads lean or use reference tokens to stay within the 4KB limit."

#### How do httpOnly cookies work with SPAs?
- **The Engine Mechanism (Why it behaves this way):** In SPAs, the backend sets httpOnly cookies on login/refresh responses. The browser automatically includes them in subsequent API requests. The SPA never reads the cookies — it just makes API calls and handles responses. For CORS, the backend must set `Access-Control-Allow-Credentials: true` and specify the exact origin (not `*`).
- **The Unforgettable Mental Model:** The **Invisible Assistant**. The SPA makes requests, and an invisible assistant (browser) silently attaches the credentials (cookies) to each request. The SPA doesn't need to know about the credentials — it just focuses on the business logic.
- **The Trap:** Using `Access-Control-Allow-Origin: *` with credentials. Browsers reject this combination. The backend must specify the exact origin when credentials (cookies) are involved.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: httpOnly cookies work well with SPAs because the browser handles cookie management automatically. The backend sets cookies on auth responses, and the browser includes them in subsequent API requests. The SPA never touches the cookies directly. For cross-origin setups, the backend must configure CORS with `Access-Control-Allow-Credentials: true` and a specific origin (not wildcard). The frontend also needs `withCredentials: true` on fetch/XMLHttpRequest to include cookies in cross-origin requests."

#### What would you monitor for httpOnly cookies?
- **The Engine Mechanism (Why it behaves this way):** Monitor: cookie set success rates (are cookies being stored?), cookie delivery rates (are cookies being sent with requests?), cookie size distribution (approaching 4KB limit?), SameSite policy violation rates, and cross-origin cookie blocking rates (third-party cookie deprecation impact).
- **The Unforgettable Mental Model:** The **Cookie Delivery Tracker**. You're watching whether cookies are being placed correctly (set rates), whether they're arriving with requests (delivery rates), and whether they're getting too heavy (size limits).
- **The Trap:** Not monitoring cookie size. As JWTs accumulate claims, they can approach the 4KB browser limit, causing silent auth failures.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor httpOnly cookie health through set success rates, delivery rates on authenticated requests, cookie size distribution (watching for 4KB limit approach), and SameSite policy violation rates. I also track cross-origin cookie blocking as browsers deprecate third-party cookies. Alerting on sudden drops in cookie delivery rates catches browser policy changes or misconfigurations before they affect all users. Cookie size monitoring is especially important for JWT-based auth where payload growth can silently break auth."

## 8. Active recall test

1. **What does the httpOnly cookie flag do?**
   - **Explanation:** It prevents JavaScript from accessing the cookie via document.cookie or any JS API. The browser still sends it with matching HTTP requests. Enforced at the browser engine level.
2. **How do you set an httpOnly cookie in Express?**
   - **Explanation:** `res.cookie('token', value, { httpOnly: true, secure: true, sameSite: 'lax' })`. The server sets it in the Set-Cookie response header with appropriate flags.
3. **Can JavaScript delete an httpOnly cookie?**
   - **Explanation:** No. JavaScript cannot directly delete httpOnly cookies. Only the server can delete them by setting an expiration date in the past via Set-Cookie header.
4. **Do httpOnly cookies prevent CSRF attacks?**
   - **Explanation:** No. httpOnly only prevents JavaScript access. CSRF exploits automatic cookie sending. CSRF protection requires SameSite attribute, anti-CSRF tokens, or custom header requirements.
5. **What is the browser cookie size limit?**
   - **Explanation:** ~4KB per cookie. Large JWTs can exceed this limit, causing truncation or rejection. Keep JWT payloads lean or use reference tokens.
6. **How do httpOnly cookies work with cross-origin SPAs?**
   - **Explanation:** The backend must set `Access-Control-Allow-Credentials: true` with a specific origin (not `*`). The frontend uses `withCredentials: true` on requests. Cookies are sent automatically by the browser.
7. **Why can't the frontend check token expiry with httpOnly cookies?**
   - **Explanation:** httpOnly cookies are invisible to JavaScript. The frontend must make a server request to check token status or handle 401 responses to detect expiration.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What are HttpOnly cookies in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What are HttpOnly cookies in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
