# How do you avoid duplicate API calls

## Detailed explanation

How do you avoid duplicate API calls is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you avoid duplicate api calls affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What causes duplicate API calls in React applications?
- **The Engine Mechanism (Why it behaves this way):** Duplicate API calls occur from: (1) React Strict Mode in development (mounts components twice), (2) multiple components requesting the same data independently, (3) rapid user interactions triggering the same request (double-clicking a button), (4) race conditions where a component remounts before the previous request completes, and (5) missing request deduplication in the data-fetching layer.
- **The Unforgettable Mental Model:** The **Duplicate Order**. You order a coffee (API call), but the barista didn't hear you, so you order again. Now you have two coffees. If the cafe had a ticket system (deduplication), your second order would have been linked to the first.
- **The Trap:** Blaming React Strict Mode for all duplicate calls. Strict Mode only affects development. In production, duplicates come from component architecture (multiple components fetching the same data) and user behavior (rapid clicks).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Duplicate API calls come from several sources: React Strict Mode double-mounting in development, multiple components independently fetching the same data, rapid user interactions like double-clicks, and race conditions from component remounts. I address each: Strict Mode duplicates are development-only, shared data is handled by a caching layer like TanStack Query, user interactions are debounced or disabled during loading, and race conditions are handled with AbortController."

#### How does TanStack Query prevent duplicate calls?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query deduplicates requests by query key. When multiple components use `useQuery` with the same key simultaneously, TanStack Query makes only one network request and shares the result with all callers. It also caches results for a configurable `staleTime` — within this window, subsequent calls return cached data without any network request. After `staleTime`, the next call triggers a background refetch.
- **The Unforgettable Mental Model:** The **Group Order**. Five coworkers (components) all want coffee from the same shop (API endpoint). Instead of five separate trips, one person orders for everyone (deduplication). If someone orders again within 5 minutes (staleTime), they get the same coffee from the thermos (cache) — no new trip needed.
- **The Trap:** Setting `staleTime` too low. If `staleTime` is 0 (default), every component mount triggers a new request even if the data hasn't changed. Set `staleTime` based on how frequently the data actually changes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TanStack Query deduplicates by query key — multiple components using the same key share one network request. It also caches results for a configurable `staleTime`. Within this window, calls return cached data without network requests. After `staleTime`, the next call triggers a background refetch while serving cached data immediately. I set `staleTime` based on data freshness needs — user profile data might be stale after 5 minutes, while real-time stock prices might be stale after 10 seconds."

#### How do you prevent duplicate calls from rapid user interactions?
- **The Engine Mechanism (Why it behaves this way):** Rapid user interactions (double-clicking submit, rapid search typing) are handled by: (1) disabling the button during the pending request (`disabled={isLoading}`), (2) debouncing user input (wait X ms after last keystroke before firing), and (3) using AbortController to cancel the previous request when a new one is triggered. These techniques ensure only one request is active at a time for a given action.
- **The Unforgettable Mental Model:** The **One-at-a-Time Turnstile**. Only one person (request) can pass through the turnstile at a time. If someone tries to push through while another is passing, they're blocked (disabled button) or asked to wait (debounce).
- **The Trap:** Only disabling the button without debouncing. Disabling prevents double-clicks but doesn't help with rapid typing in search inputs where each keystroke could trigger a request.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I prevent duplicate calls from rapid interactions with three techniques: disable buttons during loading (`disabled={isLoading}`), debounce user input for search fields (wait 300ms after last keystroke), and use AbortController to cancel the previous request when a new one is triggered. For search specifically, I combine debounce with cancellation — each new keystroke cancels the pending request and starts a new timer."

#### How do you implement request deduplication without a library?
- **The Engine Mechanism (Why it behaves this way):** Manual deduplication uses a Map to track in-flight requests by a unique key (URL + params). Before making a request, check if one is already in flight for that key. If yes, return the existing promise. If no, create the request, store its promise in the Map, and remove it when the request settles (success or error). This ensures only one request per key is active at any time.
- **The Unforgettable Mental Model:** The **Shared Taxi**. Multiple people (components) want to go to the same destination (API endpoint). Instead of each hailing their own taxi, they share one. The first person hails it, others join the same ride, and everyone arrives together.
- **The Trap:** Not removing completed requests from the Map. This causes memory leaks — the Map grows indefinitely with completed promise references. Always clean up in both success and error handlers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement deduplication with a Map keyed by request identifier (URL + serialized params). Before making a request, I check if a promise already exists for that key. If yes, I return it. If no, I create the fetch, store the promise, and remove it when settled using `.finally()`. This ensures one request per key. The key design: cleanup in `.finally()` handles both success and error cases, preventing memory leaks from abandoned promise references."

#### How do you handle duplicate calls caused by React Strict Mode?
- **The Engine Mechanism (Why it behaves this way):** React Strict Mode in development mounts components twice (mount → unmount → mount) to detect side effects. This causes `useEffect`-based fetches to fire twice. Solutions: (1) use a data-fetching library like TanStack Query that handles deduplication automatically, (2) use an `AbortController` in useEffect's cleanup to cancel the first request, or (3) use a ref to track whether the component has already fetched. Note: this only affects development — production mounts once.
- **The Unforgettable Mental Model:** The **Fire Drill**. Strict Mode is like a fire drill — it tests the building by evacuating and re-entering (mount-unmount-mount). The real fire (production) only happens once. The drill helps catch problems but shouldn't affect the actual building.
- **The Trap:** Trying to "fix" Strict Mode duplicates in production code. Strict Mode is development-only. Any workaround that changes production behavior is solving a non-existent problem and may introduce bugs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Strict Mode duplicates are development-only — they don't affect production. I handle them by using TanStack Query (which deduplicates automatically) or by using AbortController in useEffect cleanup to cancel the first mount's request. I never add production code to work around Strict Mode behavior. If I see duplicate requests in production, the cause is something else — multiple components fetching the same data or missing debouncing."

#### How do you test that duplicate calls are prevented?
- **The Engine Mechanism (Why it behaves this way):** Testing deduplication involves making multiple simultaneous requests for the same data and verifying only one network call is made. With MSW, you can count how many times a handler is called. With Jest mocks, you can spy on the fetch function and assert it was called once despite multiple component renders or user interactions. Test scenarios: concurrent component mounts, rapid button clicks, and rapid search input.
- **The Unforgettable Mental Model:** The **Traffic Counter**. You place a counter (test spy) on the road (network) and verify that despite multiple cars trying to enter (component mounts, clicks), only one actually passes through (network call).
- **The Trap**: Only testing that the correct data is rendered, not that only one request was made. The UI might look correct even with duplicate requests — the bug is in wasted network traffic and server load.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test deduplication by spying on the fetch function or using MSW to count handler invocations. I render multiple components that request the same data and assert fetch was called once, not once per component. I also test rapid interactions — click a button twice rapidly and assert only one request was made. The key assertion is on the number of network calls, not just the rendered output, since duplicate calls can produce correct UI while wasting resources."

#### What would you monitor for duplicate API calls in production?
- **The Engine Mechanism (Why it behaves this way):** Duplicate call monitoring tracks request volume per endpoint, the ratio of unique requests to total requests, and server-side request deduplication effectiveness. A high ratio of total-to-unique requests indicates frontend deduplication isn't working. Server-side monitoring can detect when the same endpoint is hit multiple times with identical params within a short window.
- **The Unforgettable Mental Model:** The **Duplicate Receipt Detector**. At the checkout, it flags when the same item is scanned multiple times in quick succession. Some duplicates are legitimate (buying 2 of the same item), but most indicate a scanning error.
- **The Trap**: Only monitoring total request volume without comparing to unique requests. High total volume might be legitimate (many users), but a high total-to-unique ratio indicates duplicate calls from individual users.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor the ratio of total requests to unique requests per endpoint — a high ratio indicates duplicate calls. I also track request volume per user session to detect individual users making redundant requests. On the server side, I monitor identical requests within short time windows as a proxy for frontend deduplication failures. I set alerts for sudden increases in the duplicate ratio, which often indicates a regression in the data-fetching layer."

## 8. Active recall test

1. **What are the main causes of duplicate API calls in React?**
   - **Explanation:** React Strict Mode double-mounting (development only), multiple components fetching the same data independently, rapid user interactions (double-clicks, rapid typing), race conditions from component remounts, and missing request deduplication in the data-fetching layer.

2. **How does TanStack Query prevent duplicate calls?**
   - **Explanation:** By query key deduplication — multiple components with the same key share one network request. It also caches results for a configurable `staleTime`, returning cached data without network requests within that window. After staleTime, it triggers a background refetch.

3. **How do you prevent duplicate calls from rapid button clicks?**
   - **Explanation:** Disable the button during loading: `disabled={isLoading}`. This prevents the user from triggering a second request while the first is pending. Combine with AbortController for cancellation if the component unmounts during the request.

4. **How do you implement request deduplication without a library?**
   - **Explanation:** Use a Map keyed by request identifier (URL + params). Before making a request, check if a promise exists for that key. If yes, return it. If no, create the request, store the promise, and remove it in `.finally()` when settled. This ensures one request per key.

5. **Should you worry about Strict Mode duplicate calls in production?**
   - **Explanation:** No. Strict Mode double-mounting is development-only. Production mounts components once. Any workaround that changes production behavior to fix Strict Mode duplicates is solving a non-existent problem and may introduce bugs.

6. **How do you test that deduplication is working?**
   - **Explanation:** Spy on the fetch function or use MSW to count handler invocations. Render multiple components requesting the same data and assert fetch was called once. Test rapid interactions (double-clicks) and assert only one request was made. Assert on call count, not just rendered output.

7. **What production metric indicates deduplication failures?**
   - **Explanation:** The ratio of total requests to unique requests per endpoint. A high ratio means the same data is being requested multiple times unnecessarily. Also track request volume per user session to detect individual users making redundant requests.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you avoid duplicate API calls in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you avoid duplicate API calls in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
