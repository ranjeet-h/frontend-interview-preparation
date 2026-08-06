# What are access tokens

## Detailed explanation

What are access tokens is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what are access tokens by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what are access tokens affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is an access token?
- **The Engine Mechanism (Why it behaves this way):** An access token is a short-lived credential that proves the holder's identity and permissions to access protected resources. It's typically a JWT containing claims (user ID, scopes, expiration) signed by the authorization server. The resource server validates the token's signature and claims before granting access to the requested resource.
- **The Unforgettable Mental Model:** The **Day Pass**. Think of an access token as a conference day pass — it gets you into the building and specific rooms for today only. Tomorrow you need a new pass. It's not permanent; it's a temporary key for immediate access.
- **The Trap:** Confusing access tokens with refresh tokens. Access tokens are short-lived and used for API requests. Refresh tokens are long-lived and used only to obtain new access tokens. They serve different purposes and have different security requirements.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: An access token is a short-lived credential that grants access to protected resources. It typically contains identity claims and permissions, cryptographically signed so any resource server can validate it without contacting the authorization server. Access tokens are sent with each API request, usually in the Authorization header as a Bearer token. Their short lifespan (5-15 minutes) limits the damage if they're compromised."

#### Why are access tokens short-lived?
- **The Engine Mechanism (Why it behaves this way):** Short expiration limits the window of exploitation if a token is stolen. A token valid for 5 minutes gives an attacker at most 5 minutes of access. A token valid for 30 days gives 30 days. Short-lived tokens work with refresh tokens to maintain user experience — the user stays logged in while access tokens rotate frequently.
- **The Unforgettable Mental Model:** The **Ice Cube**. An ice cube melts quickly — that's the point. If it lasted forever, it wouldn't be safe to store. Short-lived tokens are like ice: they serve their purpose and then disappear, minimizing the risk of misuse.
- **The Trap:** Making access tokens too short (30 seconds) causing constant refresh churn, or too long (24 hours) defeating the security purpose. The sweet spot is 5-15 minutes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access tokens are short-lived to minimize the blast radius of token theft. A 5-15 minute expiration means a stolen token is only useful for a brief window. User experience isn't impacted because refresh tokens silently obtain new access tokens in the background. The balance is between security (shorter is better) and reliability (too short causes excessive refresh failures during network issues)."

#### How are access tokens used in API requests?
- **The Engine Mechanism (Why it behaves this way):** The client includes the access token in the `Authorization` header using the Bearer scheme: `Authorization: Bearer <token>`. The server's middleware extracts the token, validates its signature and claims, extracts the user identity, and attaches it to the request context for downstream handlers to use.
- **The Unforgettable Mental Model:** The **Cover Letter**. When you submit an application, the cover letter (access token) introduces you and establishes your credentials before the reader even looks at your resume (the actual request data).
- **The Trap:** Passing tokens in URL query parameters. URLs are logged in server logs, browser history, and proxy logs, exposing tokens. Always use the Authorization header.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access tokens are sent in the Authorization header using the Bearer scheme — `Authorization: Bearer <token>`. The server extracts and validates the token in middleware before the request reaches the handler. I never pass tokens in URL parameters because URLs are logged everywhere. The middleware attaches the validated user identity to the request context so handlers can access it without re-validating."

#### What happens when an access token expires?
- **The Engine Mechanism (Why it behaves this way):** The resource server returns a 401 Unauthorized response. The client's interceptor catches this, sends the refresh token to the `/refresh` endpoint, receives a new access token, retries the original request with the new token, and the user experiences no interruption. If the refresh token is also expired or invalid, the client redirects to login.
- **The Unforgettable Mental Model:** The **Automatic Vending Machine**. Your snack card (access token) runs out of credit. Instead of making you go home, the machine automatically swaps it for a fresh card (refresh flow) and continues your purchase. You barely notice.
- **The Trap:** Not handling 401 responses gracefully. If the frontend doesn't catch expired tokens and trigger refresh, users get logged out unexpectedly even though they have a valid refresh token.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: When an access token expires, the API returns 401. The frontend should have an HTTP interceptor that catches 401s, attempts to refresh the token using the refresh token, retries the original request with the new token, and only redirects to login if the refresh also fails. This creates a seamless experience where users stay logged in as long as their refresh token is valid."

#### What claims should an access token contain?
- **The Engine Mechanism (Why it behaves this way):** Standard claims: `sub` (subject/user ID), `exp` (expiration), `iat` (issued at), `iss` (issuer), `aud` (audience). Application claims: `roles`, `scopes`, `permissions`. Avoid sensitive data (email, PII) unless necessary, and never put secrets in the token since the payload is readable.
- **The Unforgettable Mental Model:** The **ID Badge**. Your badge shows your name, photo, department, and access level — enough to verify identity and permissions, but not your home address or social security number.
- **The Trap:** Putting too much data in the token. Every claim increases token size (more bandwidth) and becomes harder to invalidate (embedded data can't be changed without reissuing). Keep tokens lean.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access tokens should contain the minimum claims needed for authorization: user ID (sub), expiration (exp), issuer (iss), and relevant roles or scopes. I avoid putting PII or sensitive data in tokens since the payload is base64-encoded, not encrypted. I also keep tokens small — every extra claim increases bandwidth and makes the token harder to manage. If I need detailed user data, I fetch it from a user profile endpoint, not from the token."

#### How do access tokens affect frontend architecture?
- **The Engine Mechanism (Why it behaves this way):** The frontend needs: secure token storage (httpOnly cookies preferred), HTTP interceptors to attach tokens to requests, 401 handlers for token refresh, loading states during refresh, and logout logic to clear tokens. The token lifecycle shapes the entire auth layer of the frontend.
- **The Unforgettable Mental Model:** The **Concierge Service**. The frontend concierge manages the guest's key cards (tokens) — checking them in, swapping expired cards for new ones, and collecting them at checkout. The guest just enjoys the hotel.
- **The Trap:** Synchronous token refresh blocking the UI. If the refresh request blocks rendering, the user sees a frozen screen. Refresh should be asynchronous with optimistic retries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access tokens shape the frontend's auth architecture. I use httpOnly cookies for storage, HTTP interceptors to attach tokens automatically, and a 401 handler that triggers silent refresh. The refresh flow must be non-blocking — queue incoming requests during refresh, then replay them with the new token. I also handle race conditions where multiple requests get 401 simultaneously by ensuring only one refresh request is in flight at a time."

#### What would you monitor for access tokens?
- **The Engine Mechanism (Why it behaves this way):** Key metrics: token validation failure rates (expired, invalid signature, wrong issuer), token refresh success/failure rates, average token lifetime usage (do users typically use tokens for 2 minutes or 14 minutes of a 15-minute window?), token issuance volume, and 401 rates by endpoint.
- **The Unforgettable Mental Model:** The **Token Pulse Monitor**. You're watching the heartbeat of the auth system — how many tokens are being issued, how many are failing validation, and how often refresh is succeeding.
- **The Trap:** Not monitoring token refresh failure rates. A spike in refresh failures means users are being logged out en masse, which could indicate a refresh token infrastructure issue or a signing key rotation problem.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor access token health through validation failure rates broken down by cause (expired, invalid signature, wrong issuer), refresh token success rates, and token issuance volume. I also track the average token lifetime utilization — if most tokens expire unused, expiration might be too short. Alerting on refresh failure rates is critical because a broken refresh flow logs out all active users simultaneously."

## 8. Active recall test

1. **What is an access token?**
   - **Explanation:** A short-lived credential (typically a JWT) that proves identity and permissions to access protected resources. Sent with each API request via the Authorization header.
2. **Why are access tokens short-lived?**
   - **Explanation:** To limit the window of exploitation if stolen. A 5-15 minute expiration means a compromised token is only useful briefly. User experience is maintained through refresh tokens.
3. **How should access tokens be sent in API requests?**
   - **Explanation:** In the Authorization header using the Bearer scheme: `Authorization: Bearer <token>`. Never in URL parameters, as URLs are logged in multiple places.
4. **What happens when an access token expires during an API call?**
   - **Explanation:** The server returns 401. The frontend catches this, uses the refresh token to get a new access token, retries the original request, and the user experiences no interruption.
5. **What standard claims should an access token contain?**
   - **Explanation:** sub (user ID), exp (expiration), iat (issued at), iss (issuer), aud (audience). Plus application-specific claims like roles or scopes. Avoid PII and sensitive data.
6. **Why shouldn't you put sensitive data in an access token?**
   - **Explanation:** JWT payloads are base64-encoded, not encrypted. Anyone who intercepts the token can read its contents. Only put non-sensitive identity and permission claims in the token.
7. **What is the key frontend challenge with access tokens?**
   - **Explanation:** Handling token refresh transparently — catching 401s, refreshing tokens, retrying requests, and managing race conditions when multiple requests expire simultaneously.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What are access tokens in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What are access tokens in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
