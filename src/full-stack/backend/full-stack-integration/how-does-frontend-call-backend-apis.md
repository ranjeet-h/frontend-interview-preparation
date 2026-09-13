# How does frontend call backend APIs

## Detailed explanation

How does frontend call backend APIs is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how does frontend call backend apis affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How does the frontend actually call a backend API?
- **The Engine Mechanism (Why it behaves this way):** The frontend uses the browser's `fetch` API or a library like Axios to construct an HTTP request with a method (GET, POST, etc.), URL, headers (Content-Type, Authorization), and optional body. The browser's networking stack opens a TCP connection (or reuses one via HTTP/2 multiplexing), sends the request, and waits for the response. The response is parsed (JSON via `.json()`, text via `.text()`) and returned as a JavaScript promise.
- **The Unforgettable Mental Model:** The **Restaurant Waiter**. The frontend (customer) writes an order on a ticket (HTTP request), hands it to the waiter (browser networking), who delivers it to the kitchen (backend). The kitchen prepares the dish (processes request) and the waiter brings it back (HTTP response).
- **The Trap:** Thinking `fetch` throws on HTTP errors like 404 or 500. `fetch` only rejects on network failures. HTTP error statuses resolve successfully — you must check `response.ok` manually.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend calls backend APIs using HTTP — typically through `fetch` or Axios. We construct a request with the appropriate method, URL, headers for auth and content type, and a serialized body for mutations. The browser handles the TCP connection, TLS handshake, and HTTP protocol details. We then parse the response, check for HTTP errors explicitly since `fetch` doesn't reject on 4xx/5xx, and map the result to our application state."

#### What happens when an API call fails?
- **The Engine Mechanism (Why it behaves this way):** API failures fall into categories: network errors (DNS failure, no internet, CORS rejection), HTTP errors (4xx client errors, 5xx server errors), and timeout errors (server takes too long). Each requires different handling. Network errors throw exceptions. HTTP errors return responses with status codes that must be inspected. Timeouts require explicit AbortController configuration.
- **The Unforgettable Mental Model:** The **Traffic Light System**. Green (2xx) — proceed normally. Yellow (4xx) — the client made a mistake, fix the request. Red (5xx) — the server is broken, retry or show error. Black (network error) — the road is closed, check connectivity.
- **The Trap:** Showing a generic "Something went wrong" for all errors. Users need context: "Your session expired" (401) vs "This item doesn't exist" (404) vs "Server is temporarily unavailable" (503).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I categorize API failures into three buckets: network errors, HTTP errors, and timeouts. Network errors like CORS or DNS failures throw exceptions that I catch and handle with connectivity messaging. HTTP errors I inspect by status code — 401 triggers re-authentication, 404 shows not-found UI, 422 displays validation errors, and 5xx shows retry options. I use AbortController for timeouts and implement exponential backoff for transient 5xx errors."

#### How do you handle loading states during API calls?
- **The Engine Mechanism (Why it behaves this way):** Loading states track the lifecycle of an async request: idle → loading → success/error. The UI renders different branches based on this state. Proper loading state management prevents race conditions where a slow response from an earlier request overwrites a faster later response.
- **The Unforgettable Mental Model:** The **Elevator Indicator**. When you press the button (initiate request), the light turns on (loading state). When the elevator arrives (response received), the light turns off and doors open (show data or error).
- **The Trap:** Not handling the "stale response" race condition. If a user clicks "Search A" then "Search B" quickly, response B might arrive before A, but A's response could overwrite B's results if not tracked by request ID.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I manage loading states as a finite state machine — idle, loading, success, and error. I use a loading flag that's set true before the request and false in both success and error handlers. To prevent race conditions, I track request IDs or use AbortController to cancel stale requests. For UX, I show skeleton screens for initial loads and spinners for subsequent refreshes, keeping the interface responsive and predictable."

#### What is the difference between fetch and Axios?
- **The Engine Mechanism (Why it behaves this way):** `fetch` is a native browser API that returns promises and uses a two-step process: first get the Response object, then call `.json()` to parse. Axios is a third-party library that automatically parses JSON, transforms request/response data, intercepts calls, and rejects on HTTP errors. Axios also works in Node.js, while `fetch` requires Node 18+.
- **The Unforgettable Mental Model:** The **Basic Phone vs. Smartphone**. `fetch` is the basic phone — it makes calls (requests) and that's it. Axios is the smartphone — it auto-translates languages (JSON parsing), has a contact manager (interceptors), and works everywhere (browser + Node).
- **The Trap:** Assuming `fetch` is always better because it's native. For complex apps with interceptors, request cancellation, and automatic retries, Axios saves significant boilerplate.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: `fetch` is the browser-native API — lightweight, promise-based, but requires manual JSON parsing and explicit error checking. Axios is a feature-rich library that auto-parses JSON, rejects on HTTP errors, provides request/response interceptors for auth and logging, and works in both browser and Node. I choose `fetch` for simple projects and Axios or fetch-plus-wrapper for apps needing interceptors, automatic retries, or isomorphic code."

#### How do you structure API calls in a large React application?
- **The Engine Mechanism (Why it behaves this way):** Large applications need a centralized API layer to avoid duplicating base URLs, auth headers, error handling, and retry logic across components. This is typically done through an API client module that exports typed functions for each endpoint, using a shared HTTP client instance configured with interceptors.
- **The Unforgettable Mental Model:** The **Central Post Office**. Instead of every resident (component) driving to the post office individually, there's a centralized mailroom (API layer) that handles all outgoing and incoming mail with consistent stamping (auth), sorting (error handling), and tracking (logging).
- **The Trap:** Putting API calls directly inside components. This couples UI to networking details, makes testing harder, and duplicates error handling logic across the codebase.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I structure API calls in a dedicated services layer. I create a configured HTTP client instance with base URL, auth interceptors, and error handling. Then I export typed API functions like `fetchUsers()` or `createOrder()` from service modules. Components call these functions through custom hooks or data-fetching libraries like TanStack Query. This separation keeps components focused on rendering, enables easy mocking in tests, and centralizes cross-cutting concerns like retry logic and error transformation."

#### How do you handle API versioning from the frontend?
- **The Engine Mechanism (Why it behaves this way):** API versioning ensures frontend and backend can evolve independently. Common strategies include URL versioning (`/api/v1/users`), header versioning (`Accept: application/vnd.api.v2+json`), or query parameters. The frontend must consistently use the correct version and handle deprecation warnings from the backend.
- **The Unforgettable Mental Model:** The **Language Translator**. Versioning is like agreeing on which language to speak. v1 is English, v2 is Spanish. As long as both parties agree on the language, communication works. When upgrading, you need a transition period where both languages are understood.
- **The Trap:** Hardcoding API versions in multiple places. When the backend deprecates v1, you need to update every call. Version should be configured once in the API client's base URL.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle API versioning by configuring the version in a single place — typically the API client's base URL like `/api/v2/`. This makes version upgrades a one-line change. I also monitor deprecation headers from the backend (`Deprecation: true`, `Sunset: <date>`) and log warnings when the backend signals an upcoming version sunset. For gradual migrations, I can route specific endpoints to different versions while the rest use the default."

#### What would you monitor for API calls in production?
- **The Engine Mechanism (Why it behaves this way):** Production monitoring for API calls tracks success rate, latency percentiles (p50, p95, p99), error rates by status code, request volume, and payload sizes. Tools like Sentry, Datadog, or custom logging capture this data. Alerting triggers when error rates spike or latency exceeds thresholds.
- **The Unforgettable Mental Model:** The **Car Dashboard**. Speed (latency), fuel gauge (request volume), warning lights (error rates), and engine temperature (server health). You don't wait for the car to break down — you watch the gauges and act before problems escalate.
- **The Trap:** Only monitoring average latency. The average hides outliers — p99 latency reveals what your worst-off users experience, which is often where real problems hide.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor API calls across four dimensions: success rate (targeting 99.9%+), latency percentiles (p50, p95, p99), error rates broken down by status code, and request volume trends. I set alerts for error rate spikes and p99 latency exceeding SLA thresholds. I also track payload sizes to catch unbounded responses and monitor CORS errors which indicate deployment or configuration issues. All API errors are logged with correlation IDs for distributed tracing."

## 8. Active recall test

1. **What does fetch return on a 404 response?**
   - **Explanation:** fetch returns a resolved Response object with `response.ok` set to `false` and `response.status` set to 404. It does NOT throw an error — you must check `response.ok` or `response.status` manually to detect HTTP errors.

2. **How do you cancel a pending API request?**
   - **Explanation:** Use `AbortController`. Create an instance, pass `controller.signal` to fetch's options, and call `controller.abort()` to cancel. The fetch promise rejects with an `AbortError`.

3. **What are the three categories of API failures?**
   - **Explanation:** Network errors (DNS failure, no connectivity, CORS rejection — these throw exceptions), HTTP errors (4xx client errors, 5xx server errors — these return Response objects with error status codes), and timeout errors (server takes too long — require explicit AbortController with setTimeout).

4. **Why should API calls not live directly in React components?**
   - **Explanation:** Putting API calls in components couples UI to networking, duplicates error handling and auth logic, makes testing harder (can't easily mock), and violates separation of concerns. A dedicated API service layer centralizes configuration, interceptors, and error transformation.

5. **What is the race condition with loading states and how do you prevent it?**
   - **Explanation:** If a user triggers two requests rapidly (e.g., search "A" then "B"), the first response might arrive after the second, overwriting correct data with stale results. Prevent this by using AbortController to cancel stale requests, tracking request IDs, or using data-fetching libraries that handle request deduplication and ordering.

6. **How do you handle API versioning centrally?**
   - **Explanation:** Configure the API version once in the HTTP client's base URL (e.g., `baseURL: '/api/v2/'`). This makes version upgrades a single configuration change. Monitor deprecation headers from the backend and log warnings when versions approach sunset dates.

7. **What latency metric matters most for user experience?**
   - **Explanation:** p99 latency (the latency experienced by the slowest 1% of requests) matters most for user experience. Average latency hides outliers — a p99 of 5 seconds means 1 in 100 users waits 5+ seconds, which is often where real UX problems and bugs hide.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How does frontend call backend APIs in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How does frontend call backend APIs in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
