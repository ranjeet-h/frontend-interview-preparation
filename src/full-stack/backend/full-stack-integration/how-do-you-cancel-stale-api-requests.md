# How do you cancel stale API requests

## Detailed explanation

How do you cancel stale API requests is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you cancel stale api requests affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is a stale API request?
- **The Engine Mechanism (Why it behaves this way):** A stale request is an in-flight API call whose result is no longer needed because a newer request has been made for the same data. This commonly happens with search (user types "a", then "ap", then "app" — the "a" and "ap" requests are stale), pagination (user clicks page 2, then immediately page 3), or filtering (user changes filter A, then filter B before A's response arrives). When stale responses arrive after newer ones, they can overwrite correct data with outdated results.
- **The Unforgettable Mental Model:** The **Old Newspaper**. You ordered today's paper (latest request), but yesterday's paper (stale request) arrives first. If you read yesterday's paper thinking it's today's, you get outdated information. You need to discard the old paper when the new one arrives.
- **The Trap:** Not distinguishing between stale requests and duplicate requests. Duplicates are identical requests that should be deduplicated. Stale requests are superseded requests that should be cancelled.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A stale request is an in-flight API call whose result is no longer relevant because a newer request supersedes it. This happens with search, pagination, and filter changes. When stale responses arrive after newer ones, they can overwrite correct data with outdated results. I handle stale requests by cancelling them with AbortController when a new request is triggered, ensuring only the latest request's result is displayed."

#### How do you cancel stale requests with AbortController?
- **The Engine Mechanism (Why it behaves this way):** AbortController creates a signal object that can abort fetch requests. Before making a new request, you call `controller.abort()` on the previous controller, cancelling the in-flight request. Then you create a new controller for the new request. The cancelled request rejects with an `AbortError`, which should be caught and ignored (it's not a real error). In React, the cleanup function of useEffect calls `abort()` when dependencies change or the component unmounts.
- **The Unforgettable Mental Model:** The **Radio Channel Switch**. You're listening to one station (request), but switch to another (new request). The first station's broadcast (stale response) is cut off — you only hear the new station.
- **The Trap:** Not catching the AbortError. When a request is aborted, fetch rejects with an AbortError. If uncaught, it appears as an unhandled promise rejection in the console, even though it's expected behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use AbortController to cancel stale requests. Before making a new request, I call `controller.abort()` on the previous controller. I create a new controller for the new request and pass its signal to fetch. In the catch block, I check `if (error.name === 'AbortError')` and ignore it — it's expected, not a real error. In React, I put the abort call in useEffect's cleanup function so it fires when dependencies change or the component unmounts."

#### How does TanStack Query handle stale request cancellation?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query automatically cancels stale queries when a new query with the same key is triggered. It uses AbortController internally — when a query becomes stale (superseded by a new query), TanStack Query calls `abort()` on the in-flight request. You can also configure custom cancellation by returning a cleanup function from the `queryFn` that calls `signal.addEventListener('abort', ...)`.
- **The Unforgettable Mental Model:** The **Auto-Cancel Button**. TanStack Query is like a smart remote that automatically mutes the old channel when you switch to a new one. You don't need to press cancel manually — it happens automatically.
- **The Trap:** Not passing the AbortSignal to the underlying fetch call in custom query functions. TanStack Query provides `signal` in the queryFn context — you must pass it to fetch for cancellation to work.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TanStack Query automatically cancels stale queries using AbortController internally. When a new query supersedes an in-flight one, it aborts the old request. For custom query functions, I pass the provided `signal` to fetch: `queryFn: ({ signal }) => fetch(url, { signal })`. I can also add custom cleanup logic by listening to the signal's abort event. This gives automatic cancellation without manual AbortController management."

#### How do you handle stale requests in a search input?
- **The Engine Mechanism (Why it behaves this way):** Search inputs combine debounce and cancellation. Debounce waits for the user to stop typing (e.g., 300ms) before triggering a request. Cancellation aborts the previous request when a new one is triggered. The combination ensures: (1) we don't fire a request for every keystroke, and (2) when we do fire, any previous in-flight request is cancelled. The latest search term's result is always displayed.
- **The Unforgettable Mental Model:** The **Typist with a Eraser**. The typist (debounce) waits until you stop dictating before typing (firing request). If you change your mind and dictate something new, the typist erases the old draft (cancel stale) and starts fresh.
- **The Trap:** Using debounce without cancellation. If the user types slowly, debounce fires multiple requests that may arrive out of order. The first request (shorter query) might arrive after the last one (longer query), showing wrong results.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I combine debounce with AbortController for search. Debounce waits 300ms after the last keystroke before firing. When the debounced callback fires, it aborts any previous in-flight request and starts a new one. This ensures we don't spam the server with keystroke requests, and the latest search term's result is always displayed. I also track the search term with each request to verify the response matches the current input, as a safety net against out-of-order responses."

#### How do you prevent stale responses from overwriting newer data?
- **The Engine Mechanism (Why it behaves this way):** Even with cancellation, some stale responses may arrive (e.g., if the backend doesn't support abort). The frontend tracks a request ID or timestamp with each request. When a response arrives, it checks if the response's ID matches the current request ID. If not, the response is stale and is discarded. This is a defense-in-depth strategy alongside cancellation.
- **The Unforgettable Mental Model:** The **Timestamped Mail**. Each letter (request) has a timestamp. When mail arrives (response), you check if its timestamp matches the latest letter you sent. If it's from an older letter, you discard it — it's outdated information.
- **The Trap**: Relying solely on cancellation without response validation. If the backend doesn't honour abort signals (some servers continue processing), stale responses can still arrive and overwrite data.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a defense-in-depth approach. First, I cancel stale requests with AbortController. Second, I track a request ID or timestamp with each request. When a response arrives, I verify its ID matches the current request ID — if not, I discard it as stale. This catches cases where the backend doesn't honour abort signals. The request ID can be a simple incrementing counter or the search term itself."

#### How do you test stale request cancellation?
- **The Engine Mechanism (Why it behaves this way):** Testing cancellation involves triggering multiple rapid requests and verifying that only the latest one completes. With MSW, you can simulate delayed responses for earlier requests and immediate responses for the latest one. Assert that the earlier requests were aborted (check for AbortError) and that only the latest response updated the UI. Test scenarios: rapid search typing, quick pagination clicks, and component unmount during request.
- **The Unforgettable Mental Model:** The **Race with a Finish Line**. Multiple runners (requests) start, but only the last one to start is allowed to cross the finish line (update UI). The others are stopped mid-race (aborted).
- **The Trap**: Testing only the happy path where requests complete in order. The bug only manifests when responses arrive out of order — the stale response arrives after the fresh one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test cancellation by simulating out-of-order responses with MSW. I make request A with a 500ms delay, then request B with a 100ms delay. I assert that request A was aborted (AbortError), request B completed, and only B's response updated the UI. I also test component unmount — trigger a request, unmount the component, and assert the request was aborted. The key test is verifying stale responses don't overwrite fresh data."

#### What would you monitor for stale request cancellation in production?
- **The Engine Mechanism (Why it behaves this way):** Stale request monitoring tracks abort rates (how many requests are cancelled), the ratio of aborted-to-completed requests, and out-of-order response incidents. High abort rates are normal for search (many keystrokes, few completed searches) but abnormal for other operations. Out-of-order responses indicate the backend isn't honouring abort signals.
- **The Unforgettable Mental Model:** The **Cancelled Flight Board**. It shows how many flights were cancelled (aborted requests), why they were cancelled (superseded by newer requests), and whether any cancelled flights still landed (out-of-order responses).
- **The Trap**: Alerting on high abort rates for search. Search naturally has high abort rates — each keystroke cancels the previous request. Only alert on abnormal abort rates for non-search operations.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor abort rates by operation type — high rates are normal for search but abnormal for data fetching. I track the ratio of aborted-to-completed requests and out-of-order response incidents (detected by request ID mismatch). I set alerts for abnormal abort rates in non-search operations, which indicate excessive re-renders or race conditions. I also monitor server-side request completion rates — if the server processes requests that the client aborted, it indicates wasted server resources."

## 8. Active recall test

1. **What is a stale API request?**
   - **Explanation:** An in-flight API call whose result is no longer needed because a newer request supersedes it. Common with search (typing new characters), pagination (clicking next page), and filter changes. Stale responses arriving after newer ones can overwrite correct data with outdated results.

2. **How do you cancel a stale request with AbortController?**
   - **Explanation:** Call `controller.abort()` on the previous AbortController before creating a new one. Pass the new controller's signal to fetch. Catch the AbortError in the catch block and ignore it (`if (error.name === 'AbortError') return`). In React, call abort in useEffect's cleanup function.

3. **How does TanStack Query handle stale request cancellation?**
   - **Explanation:** Automatically — it uses AbortController internally to cancel in-flight queries when a new query with the same key is triggered. For custom query functions, pass the provided `signal` to fetch: `queryFn: ({ signal }) => fetch(url, { signal })`.

4. **Why combine debounce with cancellation for search?**
   - **Explanation:** Debounce prevents firing a request for every keystroke (waits 300ms after last keystroke). Cancellation aborts the previous request when a new one fires. Together they prevent server spam and ensure only the latest search term's result is displayed.

5. **What is the defense-in-depth strategy for stale responses?**
   - **Explanation:** (1) Cancel stale requests with AbortController. (2) Track a request ID/timestamp with each request. (3) When a response arrives, verify its ID matches the current request ID — discard if not. This catches cases where the backend doesn't honour abort signals.

6. **How do you test stale request cancellation?**
   - **Explanation:** Use MSW to simulate out-of-order responses: request A with 500ms delay, request B with 100ms delay. Assert A was aborted, B completed, and only B's response updated the UI. Also test component unmount during request.

7. **When is a high abort rate normal vs abnormal?**
   - **Explanation:** Normal for search — each keystroke cancels the previous request, resulting in many aborts. Abnormal for data fetching, mutations, or other operations where requests shouldn't be frequently superseded. High abort rates in non-search operations indicate excessive re-renders or race conditions.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you cancel stale API requests in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you cancel stale API requests in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
