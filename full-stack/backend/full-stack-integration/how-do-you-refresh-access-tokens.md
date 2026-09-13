# How do you refresh access tokens

## Detailed explanation

How do you refresh access tokens is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you refresh access tokens affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### Why do we need separate access and refresh tokens?
- **The Engine Mechanism (Why it behaves this way):** Access tokens are short-lived (minutes) and used for every API request. Refresh tokens are long-lived (days/weeks) and used only to obtain new access tokens. This separation limits the damage of a stolen access token (it expires quickly) while maintaining user convenience (refresh token keeps the session alive). If only one token existed, it would need to be long-lived for convenience but that increases the theft window.
- **The Unforgettable Mental Model:** The **Hotel Key Card and Reservation**. The room key card (access token) works for 24 hours — if lost, the damage is limited to one day. The reservation confirmation (refresh token) lasts for your entire stay and lets you get new key cards at the front desk. Losing the reservation is worse, but it's kept securely at the front desk (httpOnly cookie).
- **The Trap:** Making access tokens too long-lived "to avoid refresh complexity." A 30-day access token means a stolen token is valid for 30 days. Short access tokens (15 min) with refresh tokens provide both security and convenience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access and refresh tokens serve different purposes. Access tokens are short-lived (15 minutes) and attached to every API request — if stolen, the exposure window is minimal. Refresh tokens are long-lived (7-30 days) but only used at the refresh endpoint, reducing their exposure surface. This separation gives us security (short-lived access tokens) and convenience (persistent sessions via refresh) without the trade-off of a single long-lived token."

#### What is the refresh token rotation pattern?
- **The Engine Mechanism (Why it behaves this way):** With refresh token rotation, each time a refresh token is used, the backend issues a new access token AND a new refresh token. The old refresh token is invalidated. If a stolen refresh token is used after the legitimate user has already rotated it, the backend detects the reuse and invalidates the entire session, forcing re-authentication.
- **The Unforgettable Mental Model:** The **One-Time Use Ticket**. Each time you use your ticket (refresh token), you get a new ticket for next time. If someone tries to use your old ticket after you've already used it, the system knows something is wrong and locks your account.
- **The Trap:** Not handling the "family of tokens" invalidation correctly. When token reuse is detected, all tokens in that session family must be invalidated, not just the reused one. Otherwise the attacker still has valid tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refresh token rotation issues a new refresh token with each refresh call, invalidating the old one. If a stolen refresh token is used after the legitimate user has already rotated it, the backend detects reuse and invalidates the entire session family — all tokens from that session. This provides detection of token theft. The frontend must always store the new refresh token from the response, not reuse the old one."

#### How do you implement silent token refresh in React?
- **The Engine Mechanism (Why it behaves this way):** Silent refresh happens transparently without user interaction. The frontend checks token expiration proactively (before each request or on a timer), calls the refresh endpoint with the refresh token, updates stored tokens, and continues. In React, this is typically done in an API client interceptor, a custom hook, or an auth context effect that monitors token expiration.
- **The Unforgettable Mental Model:** The **Background App Refresh on Your Phone**. Your email app checks for new messages in the background without you opening it. Similarly, the app refreshes tokens in the background without the user noticing — no loading screens, no redirects, just seamless continuity.
- **The Trap:** Using `useEffect` with a timer for token refresh. Timers can fire when the tab is backgrounded, and multiple component mounts can create duplicate refresh calls. Use an API interceptor or singleton auth service instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement silent refresh at the API client layer, not in React components. I use a request interceptor that checks the access token's expiration before each call. If it's within 30 seconds of expiring, the interceptor pauses the request, calls the refresh endpoint, updates the stored token, and then proceeds with the original request. This keeps refresh logic out of React's lifecycle, avoids duplicate calls, and works regardless of which component initiated the request."

#### What happens if two tabs try to refresh the token simultaneously?
- **The Engine Mechanism (Why it behaves this way):** Multiple tabs sharing the same refresh token can cause race conditions. If both tabs detect expiration simultaneously, they each call the refresh endpoint. With rotation, the second tab's refresh token is already invalidated by the first tab's refresh, causing a 401 and logout. Solutions include: cross-tab communication via `BroadcastChannel` or `localStorage` events, or having the backend allow concurrent refreshes within a short window.
- **The Unforgettable Mental Model:** The **Shared ATM**. Two people with the same bank card try to withdraw from different ATMs at the same time. The first transaction succeeds, the second fails because the balance changed. They need to coordinate — one waits while the other completes.
- **The Trap:** Ignoring multi-tab scenarios. Many apps work fine in a single tab but break when users have multiple tabs open, causing unexpected logouts that are hard to reproduce and debug.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle multi-tab refresh conflicts using the BroadcastChannel API. When one tab starts a refresh, it broadcasts a 'refreshing' message. Other tabs that detect expiration listen for this message and wait for the 'refresh-complete' broadcast instead of making their own refresh call. This ensures only one refresh happens across all tabs. As a fallback, the backend can allow a short grace window where recently-used refresh tokens are still accepted."

#### How do you handle refresh token revocation on logout?
- **The Engine Mechanism (Why it behaves this way):** On logout, the frontend sends the refresh token to a logout endpoint, which invalidates it in the backend database (or Redis). The backend then deletes the httpOnly cookie. The frontend clears all local auth state. This prevents the refresh token from being used after logout, even if it was stolen before the logout.
- **The Unforgettable Mental Model:** The **Hotel Checkout**. When you check out, the front desk deactivates your key card (refresh token) in their system. Even if you kept the physical card, it won't work anymore because the system has marked it as inactive.
- **The Trap:** Only clearing frontend state without calling the backend logout endpoint. The refresh token remains valid in the backend database, so if it was stolen before logout, the attacker can still use it.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: On logout, I call a backend logout endpoint that invalidates the refresh token in the database or Redis. The backend deletes the httpOnly cookie. Then the frontend clears all local auth state — tokens, user data, cached responses. I also use `navigator.sendBeacon` for the logout call to ensure it fires even if the user closes the tab. This ensures the refresh token can't be reused after logout."

#### How do you test token refresh flows?
- **The Engine Mechanism (Why it behaves this way):** Testing token refresh involves mocking the auth server and simulating scenarios: normal refresh (200 with new tokens), refresh failure (401), concurrent refresh (multiple simultaneous 401s), and multi-tab refresh. Tests verify that the interceptor correctly queues requests, replays them with new tokens, and handles failure by redirecting to login.
- **The Unforgettable Mental Model:** The **Flight Simulator**. You don't test emergency procedures on a real plane — you use a simulator that creates exact conditions (engine failure, storm, etc.) in a controlled environment. Similarly, mock the auth server to create exact token scenarios.
- **The Trap:** Testing refresh with real tokens and real auth servers. This makes tests slow, flaky, and dependent on external services. Use mocked HTTP responses with controlled token expiration times.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test token refresh using mocked HTTP responses. I create test scenarios: successful refresh (mock 200 with new tokens), refresh failure (mock 401 on refresh endpoint), concurrent requests (mock multiple 401s followed by a successful refresh), and multi-tab conflicts. I verify that the interceptor queues requests during refresh, replays them with new tokens, and redirects to login on refresh failure. I use MSW (Mock Service Worker) for realistic network-level mocking."

#### What would you monitor for token refresh in production?
- **The Engine Mechanism (Why it behaves this way):** Token refresh monitoring tracks refresh success rate, refresh latency, concurrent refresh attempts per session, refresh-to-login redirect rate, and token rotation failures. These metrics reveal whether the refresh flow is working correctly, whether users are experiencing unexpected logouts, and whether the rotation mechanism is functioning.
- **The Unforgettable Mental Model:** The **Heart Monitor**. Each heartbeat is a successful refresh. Irregular beats (failed refreshes), skipped beats (concurrent refresh conflicts), or flatline (refresh endpoint down) all signal problems that need immediate attention.
- **The Trap:** Not monitoring concurrent refresh attempts. A high rate indicates the queuing mechanism isn't working or multi-tab coordination is failing, which leads to unexpected logouts from token rotation conflicts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor refresh success rate (targeting 99.9%+), refresh latency (should be under 200ms), concurrent refresh attempts per session (should be 1 — higher means queuing is broken), the refresh-to-login redirect rate (indicates unexpected logouts), and token rotation failure rate. I set alerts for refresh failure spikes and concurrent refresh anomalies since they directly impact user session continuity."

## 8. Active recall test

1. **Why are access tokens short-lived and refresh tokens long-lived?**
   - **Explanation:** Short-lived access tokens (15 min) limit the damage window if stolen — the token expires quickly. Long-lived refresh tokens (7-30 days) maintain user convenience by allowing silent session renewal. Since refresh tokens are only sent to the refresh endpoint (not every API call), they have less exposure surface.

2. **What is refresh token rotation and why is it secure?**
   - **Explanation:** Rotation issues a new refresh token with each refresh call, invalidating the old one. If a stolen refresh token is used after the legitimate user rotated it, the backend detects reuse and invalidates the entire session. This provides theft detection that static refresh tokens cannot offer.

3. **How do you prevent multi-tab refresh conflicts?**
   - **Explanation:** Use the BroadcastChannel API for cross-tab communication. When one tab starts refreshing, it broadcasts a 'refreshing' message. Other tabs wait for the 'refresh-complete' broadcast instead of making their own refresh call. This ensures only one refresh happens across all open tabs.

4. **What should happen on logout to properly invalidate tokens?**
   - **Explanation:** Call a backend logout endpoint that invalidates the refresh token in the database/Redis. The backend deletes the httpOnly cookie. The frontend clears all local auth state. Use `navigator.sendBeacon` to ensure the logout call fires even if the tab is closed.

5. **Where should token refresh logic live in a React app?**
   - **Explanation:** In the API client layer (interceptors), not in React components. This avoids React lifecycle issues (duplicate calls from multiple mounts, timer problems in backgrounded tabs), centralizes the logic, and works regardless of which component initiated the request.

6. **How do you test token refresh without a real auth server?**
   - **Explanation:** Use MSW (Mock Service Worker) to mock HTTP responses at the network level. Create scenarios: successful refresh (200 with new tokens), refresh failure (401), concurrent requests (multiple 401s), and multi-tab conflicts. Verify the interceptor queues, replays, and handles failures correctly.

7. **What metric indicates a broken refresh queuing mechanism?**
   - **Explanation:** Concurrent refresh attempts per session. In a properly working system, only one refresh should happen per expiration event. A rate higher than 1 means multiple requests are each triggering their own refresh, which can invalidate rotation-based tokens and cause unexpected logouts.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you refresh access tokens in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you refresh access tokens in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
