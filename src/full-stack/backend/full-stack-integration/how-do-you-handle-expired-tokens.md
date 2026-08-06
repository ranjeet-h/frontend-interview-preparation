# How do you handle expired tokens

## Detailed explanation

How do you handle expired tokens is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle expired tokens affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you detect that a token has expired?
- **The Engine Mechanism (Why it behaves this way):** Token expiration is detected in two ways: proactively (checking the token's `exp` claim before sending the request) and reactively (receiving a 401 response from the backend). JWTs contain an `exp` (expiration) field as a Unix timestamp. The frontend can decode the token (without verifying the signature) to check if `exp < Date.now() / 1000`. The backend validates the signature and expiration on every request.
- **The Unforgettable Mental Model:** The **Milk Expiration Date**. You can check the date on the carton before using it (proactive — decode `exp` claim), or you can taste it and realize it's sour (reactive — get 401 from backend). Checking beforehand saves you from a bad experience.
- **The Trap:** Only relying on reactive detection (401 responses). This means every expired token triggers a failed API call before the frontend realizes it's expired. Proactive checking prevents unnecessary failed requests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I detect expired tokens both proactively and reactively. Proactively, I decode the JWT's `exp` claim before making requests — if the token is expired or within 30 seconds of expiring, I refresh it before sending. Reactively, I use a response interceptor to catch 401 errors, which indicate the backend rejected the token. The proactive check prevents unnecessary failed requests, while the reactive check handles edge cases like clock skew or server-side token revocation."

#### What is the difference between proactive and reactive token refresh?
- **The Engine Mechanism (Why it behaves this way):** Proactive refresh checks the token's expiration time before making a request and refreshes if it's near expiry. Reactive refresh waits for a 401 response, then refreshes. Proactive prevents failed requests but requires clock synchronization. Reactive handles all expiration cases including server-side revocation but causes one failed request per expiration.
- **The Unforgettable Mental Model:** The **Gas Tank Strategy**. Proactive = refuel when the gauge hits 25% (before running out). Reactive = wait until the car stalls (401), then refuel. Proactive is smoother, but reactive catches cases where the gauge was wrong.
- **The Trap:** Using only proactive refresh without a reactive fallback. If the server revokes a token mid-session (password change, admin action), the proactive check won't catch it since the token's `exp` claim is still valid.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use both strategies together. Proactive refresh checks the token's `exp` claim before each request and refreshes if it's within 30 seconds of expiry — this prevents failed requests. Reactive refresh catches 401 responses as a fallback for cases the proactive check misses, like server-side token revocation or clock skew. The combination gives us smooth UX with complete coverage."

#### How do you handle token refresh without disrupting the user experience?
- **The Engine Mechanism (Why it behaves this way):** Token refresh should be transparent to the user. When a token expires, the frontend calls the refresh endpoint with the refresh token, receives a new access token, stores it, and retries the original request. During refresh, concurrent requests should be queued (not each trigger their own refresh) and replayed with the new token after refresh completes.
- **The Unforgettable Mental Model:** The **Pit Stop**. The car (app) pulls into the pit (refresh endpoint), gets new tires (new token), and continues racing — the driver (user) barely notices. Other cars (concurrent requests) wait in the pit lane (queue) instead of each making their own pit stop.
- **The Trap:** Letting every concurrent request trigger its own refresh call. If 5 requests get 401 simultaneously, they each call the refresh endpoint, potentially invalidating the refresh token (if using rotation) and causing a logout.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement transparent token refresh using a response interceptor with request queuing. When the first request gets a 401, it triggers the refresh flow and stores a promise. Subsequent 401s attach to the same promise instead of triggering new refresh calls. After refresh completes, all queued requests are retried with the new token. The user sees no disruption — the UI briefly pauses while the token refreshes, then continues normally."

#### What happens if the refresh token itself is expired?
- **The Engine Mechanism (Why it behaves this way):** If the refresh token is expired, the refresh endpoint returns a 401 or 403. The frontend should clear all auth state (access token, refresh token, user data), redirect to the login page, and optionally show a "Session expired, please log in again" message. The user must re-authenticate to get new tokens.
- **The Unforgettable Mental Model:** The **Expired Passport**. Your visa (access token) expired, so you try to renew it with your passport (refresh token). But your passport is also expired — you must go back to your home country (login page) and get entirely new documents.
- **The Trap:** Silently redirecting to login without clearing stale auth state. If the old tokens remain in storage, the app might try to use them again, creating an infinite 401 → refresh → 401 loop.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If the refresh token is expired, the refresh endpoint returns 401. My response interceptor catches this, clears all auth state from storage and memory, and redirects to login with a 'Session expired' message. Critically, I clear everything — access token, refresh token, user data — to prevent infinite retry loops. The user logs in again and gets a fresh set of tokens."

#### How do you handle clock skew between client and server?
- **The Engine Mechanism (Why it behaves this way):** Clock skew occurs when the client's clock differs from the server's clock. A token might appear valid on the client but expired on the server (or vice versa). Solutions include: adding a buffer window (e.g., treat tokens as expired 30 seconds before actual expiry), using server time from response headers, or letting the reactive 401 catch handle discrepancies.
- **The Unforgettable Mental Model:** The **Time Zone Conference Call**. You think the meeting is at 3 PM your time, but the server thinks it's 3:15 PM. Adding a 30-minute buffer (arriving early) ensures you never miss it, even if your watch is slightly off.
- **The Trap:** Assuming client and server clocks are synchronized. They rarely are — mobile devices can have clocks off by minutes, and server clusters may have slight drift. Always include a buffer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle clock skew with a dual approach. First, I add a 30-second buffer to proactive checks — I treat tokens as expired 30 seconds before their actual `exp` time. Second, I rely on reactive 401 handling as the ultimate source of truth, since the server's clock is authoritative. For critical applications, I can also read the server's time from response headers and calculate the offset to adjust client-side expiration checks."

#### How do you implement token refresh with request queuing?
- **The Engine Mechanism (Why it behaves this way):** Request queuing prevents multiple concurrent refresh calls. When the first request gets a 401, a `isRefreshing` flag is set and a refresh promise is created. Subsequent 401s add their retry functions to a queue array and return the shared refresh promise. After refresh completes, the queue is processed — each retry function is called with the new token, and the flag is reset.
- **The Unforgettable Mental Model:** The **Single-Lane Bridge**. Only one car (refresh call) can cross the bridge at a time. Other cars line up (queue) behind it. Once the first car crosses, the rest follow in order — no chaos, no collisions.
- **The Trap:** Not handling refresh failure for queued requests. If the refresh fails, all queued requests must be rejected and the user logged out — otherwise they hang indefinitely waiting for a token that will never arrive.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement request queuing in the response interceptor. When the first 401 arrives, I set an `isRefreshing` flag and create a refresh promise. Subsequent 401s push their retry logic into a queue array and return the shared promise. After refresh succeeds, I iterate the queue, retrying each request with the new token. If refresh fails, I reject all queued promises and redirect to login. This prevents the thundering herd problem where dozens of requests each trigger their own refresh."

#### What would you monitor for expired tokens in production?
- **The Engine Mechanism (Why it behaves this way):** Token expiration monitoring tracks refresh success/failure rates, 401 rates by endpoint, token lifetime distributions, and refresh-to-login redirect rates. These metrics reveal whether token lifetimes are appropriate, whether refresh is working reliably, and whether users are experiencing unexpected logouts.
- **The Unforgettable Mental Model:** The **Battery Health Monitor**. How often does the battery die (token expire), how often does the charger work (refresh succeed), and how often do users need to buy a new battery (re-login). If the charger fails often, users get frustrated.
- **The Trap:** Only monitoring refresh success rate. The refresh-to-login redirect rate is equally important — a high rate means refresh tokens are expiring too quickly or being invalidated unexpectedly, causing poor user experience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor token refresh success rate (targeting 99%+), 401 rates by endpoint to find auth hotspots, the ratio of refresh failures to login redirects (indicates unexpected logouts), and token lifetime distributions to validate our expiration settings. I also track concurrent refresh attempts — a spike suggests the queuing mechanism isn't working. I set alerts for refresh failure rate increases since they directly impact user session continuity."

## 8. Active recall test

1. **How do you proactively check if a JWT is expired?**
   - **Explanation:** Decode the JWT payload (base64 decode the second segment) to read the `exp` claim, which is a Unix timestamp. Compare it with the current time: `exp < Date.now() / 1000` means expired. Add a buffer (e.g., 30 seconds) to account for clock skew: `exp < Date.now() / 1000 + 30`.

2. **Why is request queuing important during token refresh?**
   - **Explanation:** Without queuing, every concurrent request that receives a 401 triggers its own refresh call. This causes redundant refresh requests, can invalidate refresh tokens (if using rotation), and may overwhelm the auth server. Queuing ensures only one refresh call happens, with all other requests waiting and retrying with the new token.

3. **What should happen when the refresh token is also expired?**
   - **Explanation:** Clear all auth state (access token, refresh token, user data) from storage and memory, then redirect to the login page with a "Session expired" message. This forces the user to re-authenticate and get fresh tokens. Failing to clear state can cause infinite 401 → refresh → 401 loops.

4. **What is the dual strategy for handling token expiration?**
   - **Explanation:** Proactive: check the token's `exp` claim before making requests, refresh if near expiry (with a clock skew buffer). Reactive: catch 401 responses in a response interceptor and trigger refresh as a fallback. Together they prevent unnecessary failed requests while handling edge cases like server-side revocation.

5. **How does clock skew affect token validation?**
   - **Explanation:** If the client's clock is ahead of the server's, the client thinks a token is valid but the server rejects it as expired. If the client's clock is behind, the client refreshes unnecessarily. Solve this by adding a buffer to proactive checks and relying on the server's 401 as the authoritative signal.

6. **What is the thundering herd problem in token refresh?**
   - **Explanation:** When a token expires, all concurrent API requests receive 401 simultaneously. Without queuing, each request independently calls the refresh endpoint, creating a spike of refresh requests. This can overwhelm the auth server, invalidate rotation-based refresh tokens, and cause cascading failures.

7. **Which metric best indicates token lifetime configuration problems?**
   - **Explanation:** The refresh-to-login redirect rate. If users are frequently redirected to login despite having refresh tokens, it means refresh tokens are expiring too quickly, being invalidated unexpectedly, or the refresh endpoint is failing. This directly impacts user experience and session continuity.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle expired tokens in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle expired tokens in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
