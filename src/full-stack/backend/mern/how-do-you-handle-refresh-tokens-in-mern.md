# How do you handle refresh tokens in MERN

## Detailed explanation

How do you handle refresh tokens in MERN is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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
Work   -> apply MERN backend rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you handle refresh tokens in mern affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle refresh tokens in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Full flow: (1) **Login** — Express generates access token (15 min) and refresh token (7 days). Access token returned in response body, refresh token set as httpOnly cookie. (2) **API request** — React includes access token in Authorization header. (3) **Token expires** — API returns 401. React's API client interceptor catches 401, calls POST /auth/refresh (browser sends httpOnly cookie automatically). (4) **Refresh** — Express verifies refresh token (signature + database check), generates new access token, returns it. (5) **Retry** — interceptor retries original request with new access token. (6) **Refresh fails** — clear auth state, redirect to login. Token rotation: each refresh generates a new refresh token, invalidating the old one.
- **The Unforgettable Mental Model:** The **Automatic Key Replacement**. Your room key (access token) expires. The hotel system (interceptor) detects this, uses your reservation (refresh token) to get a new key, and lets you continue without interruption. If the reservation is also invalid, you must re-check in (login).
- **The Trap:** Not handling the race condition where multiple 401s trigger multiple refresh requests. Queue refresh requests so only one refresh call happens at a time.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle refresh tokens through an API client interceptor. When a 401 is caught, the interceptor calls /auth/refresh, which uses the httpOnly refresh token cookie to issue a new access token. The original request is retried with the new token. I implement token rotation — each refresh generates a new refresh token. I also handle race conditions by queuing concurrent refresh requests. If refresh fails, I clear auth state and redirect to login. The whole process is transparent to components."

#### How do you implement automatic token refresh in the API client?
- **The Engine Mechanism (Why it behaves this way):** Axios interceptor pattern: `let isRefreshing = false; let failedQueue = []; const processQueue = (error, token = null) => { failedQueue.forEach(prom => { if (error) prom.reject(error); else prom.resolve(token); }); failedQueue = []; }; api.interceptors.response.use(res => res, async (err) => { const originalRequest = err.config; if (err.response?.status === 401 && !originalRequest._retry) { if (isRefreshing) { return new Promise((resolve, reject) => { failedQueue.push({ resolve, reject }); }).then(token => { originalRequest.headers.Authorization = `Bearer ${token}`; return api(originalRequest); }).catch(err => Promise.reject(err)); } originalRequest._retry = true; isRefreshing = true; try { const { data } = await api.post('/auth/refresh'); isRefreshing = false; processQueue(null, data.accessToken); originalRequest.headers.Authorization = `Bearer ${data.accessToken}`; return api(originalRequest); } catch (refreshErr) { isRefreshing = false; processQueue(refreshErr); clearAuth(); return Promise.reject(refreshErr); } } return Promise.reject(err); });`.
- **The Unforgettable Mental Model:** The **Waiting Room**. When the first person's key expires, they go get a new one (refresh). Everyone else whose key expires while the first person is getting a new one waits in the waiting room (failedQueue). When the new key arrives, everyone gets a copy and retries.
- **The Trap:** Not queueing concurrent refresh requests — multiple 401s trigger multiple refresh calls, causing race conditions and potential token invalidation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement token refresh with an axios response interceptor. When a 401 is caught, I check if a refresh is already in progress. If yes, I queue the request and wait. If no, I start the refresh. When the new token arrives, I retry all queued requests. If refresh fails, I clear auth state and reject all queued requests. The _retry flag prevents infinite loops. This handles the common case where multiple API calls fail simultaneously due to token expiration."

#### How do you implement token rotation?
- **The Engine Mechanism (Why it behaves this way):** On each refresh, generate a new refresh token and invalidate the old one: (1) Store refresh token hash in MongoDB with user ID and expiry. (2) On refresh, verify the token, find its hash in the database. (3) If found and not expired, generate new access token AND new refresh token. (4) Delete old refresh token from database, save new token's hash. (5) Set new refresh token as httpOnly cookie. (6) Return new access token. If the old token is used again (replay attack), detect it and revoke all tokens for that user, forcing re-authentication.
- **The Unforgettable Mental Model:** The **One-Time Ticket**. Each time you use your ticket (refresh token), it's exchanged for a new one. The old ticket is voided. If someone tries to use the old ticket, security knows it's been stolen and locks the account.
- **The Trap:** Not handling the race condition where the client makes two simultaneous refresh requests. The second request uses the old (now invalid) token. Allow a short grace period for the previous token.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Token rotation generates a new refresh token on each refresh, invalidating the old one. I store the refresh token hash in MongoDB, and on each refresh, I verify the token, generate a new pair, delete the old hash, and save the new one. If an old token is reused (replay attack), I detect it and revoke all tokens for that user. I handle race conditions by allowing a brief grace period for the previous token — if the old token is used within a few seconds of rotation, I still accept it but return the new token."

#### How do you handle refresh token expiry?
- **The Engine Mechanism (Why it behaves this way):** When the refresh token expires (7 days), the /auth/refresh endpoint returns 401. The API client interceptor catches this, clears auth state, and redirects to login. The user must re-authenticate. To improve UX, show a "session expired" message before redirecting. Optionally, implement "remember me" with longer-lived refresh tokens (30 days) for trusted devices. Track last activity time and extend the refresh token expiry on each successful refresh (sliding expiration).
- **The Unforgettable Mental Model:** The **Membership Card**. Your membership (refresh token) expires after a set period. When it does, you must re-register (login). If you have a premium membership (remember me), it lasts longer. Each visit extends your membership slightly (sliding expiration).
- **The Trap:** Silently redirecting to login without explanation. Users think the app broke. Always show a "session expired" message before redirecting.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: When the refresh token expires, the /auth/refresh endpoint returns 401. The interceptor catches this, shows a 'session expired' message, clears auth state, and redirects to login. I implement sliding expiration — each successful refresh extends the refresh token's expiry, so active users stay logged in. For 'remember me', I issue longer-lived refresh tokens. The key UX detail is showing a message before redirecting — silent redirects confuse users."

#### How do you test token refresh logic?
- **The Engine Mechanism (Why it behaves this way):** Test scenarios: (1) **Normal refresh** — mock 401 response, verify interceptor calls /auth/refresh and retries original request. (2) **Concurrent refresh** — mock multiple simultaneous 401s, verify only one refresh call is made and all requests are retried. (3) **Refresh failure** — mock /auth/refresh returning 401, verify auth state is cleared and redirect happens. (4) **Token rotation** — verify new refresh token is set in cookie after refresh. Use mock service worker (MSW) or jest mocks to simulate HTTP responses. Test the interceptor in isolation with a mock axios instance.
- **The Unforgettable Mental Model:** The **Fire Drill**. You test the normal evacuation (refresh), the group evacuation (concurrent requests), the failed evacuation (refresh failure), and the key replacement (token rotation). Each scenario ensures the system works under pressure.
- **The Trap:** Only testing the happy path. Token refresh bugs cause the worst user experiences — infinite redirect loops, stuck loading states, and lost data.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test token refresh with four scenarios: normal refresh (401 triggers refresh and retry), concurrent refresh (multiple 401s queue properly), refresh failure (auth cleared, redirect to login), and token rotation (new token set correctly). I use MSW or jest mocks to simulate HTTP responses. I test the interceptor in isolation with a mock axios instance. Token refresh is critical infrastructure — bugs here cause infinite loops and lost user sessions, so thorough testing is essential."

## 8. Active recall test

1. **What triggers a token refresh in the API client?**
   - **Explanation:** A 401 response from any API call. The response interceptor catches it, calls /auth/refresh, retries the original request with the new access token.

2. **How do you handle concurrent 401 responses?**
   - **Explanation:** Queue failed requests while a refresh is in progress. Only one refresh call is made. When the new token arrives, all queued requests are retried with it.

3. **What is token rotation?**
   - **Explanation:** Generating a new refresh token on each refresh, invalidating the old one. If the old token is reused, it indicates a replay attack and all tokens are revoked.

4. **What happens when the refresh token expires?**
   - **Explanation:** /auth/refresh returns 401. The interceptor clears auth state, shows a session expired message, and redirects to login. The user must re-authenticate.

5. **How do you prevent infinite redirect loops during token refresh?**
   - **Explanation:** Use a _retry flag on the original request to prevent the retried request from triggering another refresh if it also fails. Also, clear auth state if refresh itself fails.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle refresh tokens in MERN in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle refresh tokens in MERN in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
