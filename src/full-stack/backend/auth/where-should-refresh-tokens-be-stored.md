# Where should refresh tokens be stored

## Detailed explanation

Where should refresh tokens be stored is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand where should refresh tokens be stored by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, where should refresh tokens be stored affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### Where should refresh tokens be stored?
- **The Engine Mechanism (Why it behaves this way):** Refresh tokens must be stored in httpOnly, secure, sameSite cookies. Since refresh tokens are long-lived and grant persistent access, they're the most valuable credential to protect. httpOnly prevents XSS theft, secure ensures HTTPS-only transmission, and sameSite prevents CSRF. Refresh tokens should never be accessible to JavaScript.
- **The Unforgettable Mental Model:** The **Master Key**. If access tokens are room keys, refresh tokens are the master key that generates new room keys. You don't leave the master key on the front desk (localStorage) — you keep it in the manager's safe (httpOnly cookies).
- **The Trap:** Storing refresh tokens in the same place as access tokens in localStorage. Both become exposed to XSS, and since refresh tokens are long-lived, the attacker gets persistent access, not just a short window.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refresh tokens should always be stored in httpOnly, secure, sameSite cookies. They're the most valuable credential in the auth system because they're long-lived and can generate new access tokens. httpOnly prevents JavaScript access (XSS protection), secure ensures HTTPS-only transmission, and sameSite prevents CSRF. Unlike access tokens, refresh tokens are server-side revocable, but that doesn't reduce the need for secure storage — it just means you can respond to compromise."

#### Why are refresh tokens more sensitive than access tokens?
- **The Engine Mechanism (Why it behaves this way):** Access tokens are short-lived (5-15 minutes), so theft gives a limited window. Refresh tokens are long-lived (days to weeks) and can generate unlimited new access tokens. A stolen refresh token gives an attacker persistent access that survives access token expiration and can only be stopped by explicit revocation.
- **The Unforgettable Mental Model:** **Fish vs. Fishing Rod**. An access token is a fish — it feeds you once. A refresh token is the fishing rod — it keeps producing fish. Stealing the fishing rod is far more valuable than stealing a single fish.
- **The Trap:** Treating refresh tokens with the same security level as access tokens. They need stronger protection: httpOnly cookies (not localStorage), rotation on every use, and server-side storage for revocation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refresh tokens are more sensitive because they're long-lived and can generate unlimited new access tokens. A stolen access token expires in minutes; a stolen refresh token gives persistent access for days or weeks until explicitly revoked. This is why refresh tokens require the strongest storage protection (httpOnly cookies), rotation on every use, and server-side tracking for revocation. They're the crown jewel of the auth system."

#### How does refresh token storage differ from access token storage?
- **The Engine Mechanism (Why it behaves this way):** Both should use httpOnly cookies, but refresh tokens have additional requirements: they're sent only to the token endpoint (not resource endpoints), they're rotated on each use (requiring cookie updates), and they're tracked server-side for revocation. Access tokens are sent with every API request to resource servers.
- **The Unforgettable Mental Model:** **Daily Pass vs. Membership Card**. The daily pass (access token) is shown at every door you enter. The membership card (refresh token) is only shown at the membership desk to get new daily passes. The membership card stays in your wallet; the daily pass is in your hand.
- **The Trap:** Sending refresh tokens to resource endpoints. Refresh tokens should only go to the `/refresh` endpoint. Sending them elsewhere increases exposure and violates the principle of least privilege.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Both tokens use httpOnly cookies, but refresh tokens have stricter handling. They're only sent to the token refresh endpoint, not to resource APIs. They're rotated on each use, meaning the cookie is updated with every refresh. And they're tracked server-side for revocation. Access tokens, by contrast, are sent with every API request and are validated statelessly. The separation of endpoints ensures refresh tokens have minimal exposure."

#### What happens if a refresh token is stolen from cookies?
- **The Engine Mechanism (Why it behaves this way):** If an attacker steals a refresh token (through CSRF, network interception, or cookie theft), they can generate new access tokens. Defenses: (1) Rotation detects reuse of old tokens, (2) IP/device binding flags anomalous usage, (3) Short refresh token expiration limits the window, (4) Server-side revocation allows immediate invalidation.
- **The Unforgettable Mental Model:** The **Stolen Passport**. Even with a stolen passport, the attacker needs to look like the photo (IP/device matching), and if the original owner reports it stolen (revocation), it's invalidated at all border checkpoints.
- **The Trap:** Assuming httpOnly cookies are immune to theft. They protect against XSS but not against network-level attacks (without HTTPS), CSRF (without sameSite), or server-side cookie leakage (misconfigured logging).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If a refresh token is stolen, rotation is the primary defense — when the legitimate client tries to refresh with the old token, the server detects reuse and revokes the entire token family. I also use IP and device fingerprinting to flag anomalous refresh attempts, keep refresh token expiration reasonable (7-30 days), and provide users with a 'logout all devices' feature. httpOnly cookies protect against XSS but must be combined with secure (HTTPS) and sameSite (CSRF) flags for comprehensive protection."

#### How do you handle refresh token storage in SPAs?
- **The Engine Mechanism (Why it behaves this way):** SPAs should use httpOnly cookies set by the backend with appropriate flags. The frontend never reads the refresh token — it just makes POST requests to `/refresh` and the browser automatically includes the cookie. The backend validates the cookie, issues a new access token (also in an httpOnly cookie or returned in the response body), and the cycle continues.
- **The Unforgettable Mental Model:** The **Vending Machine**. You insert a card (browser sends cookie automatically), the machine validates it internally (backend), and dispenses a new product (access token). You never see the card's details — the machine handles everything.
- **The Trap:** Trying to read refresh tokens in the SPA for debugging or state management. The whole point of httpOnly is that JavaScript can't access them. Debug token issues through server logs, not client-side inspection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In SPAs, refresh tokens are stored in httpOnly cookies set by the backend. The frontend never reads them — it simply makes POST requests to the refresh endpoint, and the browser automatically includes the cookie. The backend validates the token, rotates it, and returns a new access token. This keeps refresh tokens completely invisible to JavaScript, eliminating XSS theft risk. The frontend only needs to handle the response — retry failed requests or redirect to login if refresh fails."

#### How does SameSite affect refresh token cookies?
- **The Engine Mechanism (Why it behaves this way):** SameSite=Strict prevents the cookie from being sent with any cross-site request, which blocks CSRF but also breaks legitimate cross-site navigation (e.g., clicking a link from email). SameSite=Lax allows top-level GET requests but blocks cross-site POST/PUT/DELETE. For refresh tokens (always POST), Lax is sufficient since the refresh endpoint should be POST-only.
- **The Unforgettable Mental Model:** The **Doorman's Rules**. Strict: "Don't let anyone in unless they walked directly from inside the building." Lax: "Let people in if they walked through the front door, but not if they were sent by someone outside." For refresh (POST), both work since POST is blocked cross-site in Lax.
- **The Trap:** Using SameSite=None without understanding the implications. None allows all cross-site requests, requiring additional CSRF protection. Only use None when cross-site cookie sending is genuinely needed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For refresh token cookies, SameSite=Lax is the practical default. It blocks cross-site POST requests (which is what refresh uses), preventing CSRF, while allowing normal navigation. SameSite=Strict is more secure but breaks cross-site links. SameSite=None should only be used when cross-site cookie sending is required, and even then, it must be paired with anti-CSRF tokens. Since refresh endpoints are POST-only, Lax provides adequate CSRF protection."

#### What would you monitor for refresh token storage?
- **The Engine Mechanism (Why it behaves this way):** Monitor: cookie set failure rates (cookies not being stored due to browser policies), refresh endpoint request rates (abnormal patterns indicate abuse), token rotation success rates, cookie size growth (approaching browser limits), and cross-origin cookie delivery rates (SameSite policy impact).
- **The Unforgettable Mental Model:** The **Cookie Jar Monitor**. You're watching whether cookies are being placed in the jar correctly (set rates), whether someone is reaching into the jar too often (abuse patterns), and whether the jar is getting too full (size limits).
- **The Trap:** Not monitoring browser cookie policy changes. Browser updates to SameSite defaults or third-party cookie blocking can silently break refresh token delivery.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor refresh token cookie health through set success rates, refresh endpoint request patterns, rotation success rates, and cookie size trends. I also watch for browser policy changes that might affect cookie delivery — SameSite policy updates and third-party cookie deprecation have broken auth in production. Alerting on sudden drops in cookie set rates or refresh success rates catches storage issues before they cascade into mass logouts."

## 8. Active recall test

1. **Where should refresh tokens be stored and why?**
   - **Explanation:** httpOnly, secure, sameSite cookies. Refresh tokens are long-lived and grant persistent access, making them the most valuable credential. httpOnly prevents XSS, secure ensures HTTPS, sameSite prevents CSRF.
2. **Why are refresh tokens more sensitive than access tokens?**
   - **Explanation:** Refresh tokens are long-lived (days/weeks) and can generate unlimited new access tokens. A stolen refresh token gives persistent access, while a stolen access token expires in minutes.
3. **Should the frontend JavaScript ever read the refresh token?**
   - **Explanation:** No. The refresh token should be in an httpOnly cookie that JavaScript cannot access. The frontend simply makes POST requests to the refresh endpoint; the browser automatically includes the cookie.
4. **What detects a stolen refresh token?**
   - **Explanation:** Refresh token rotation. If an old (rotated) refresh token is used, it indicates theft and the entire token family is revoked, requiring re-authentication.
5. **What SameSite value should refresh token cookies use?**
   - **Explanation:** Lax. It blocks cross-site POST requests (which refresh uses), preventing CSRF, while allowing normal navigation. Strict is more secure but breaks cross-site links.
6. **What happens if the browser blocks third-party cookies?**
   - **Explanation:** If the auth domain differs from the app domain, refresh token cookies may be blocked. Solution: use the same domain for auth and app, or implement a token-in-body fallback (less secure).
7. **Why must refresh tokens be rotated on each use?**
   - **Explanation:** Rotation creates a chain where each new token invalidates the previous one. If an old token is reused, it indicates theft, allowing detection and revocation of the compromised token family.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain Where should refresh tokens be stored in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define Where should refresh tokens be stored in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
