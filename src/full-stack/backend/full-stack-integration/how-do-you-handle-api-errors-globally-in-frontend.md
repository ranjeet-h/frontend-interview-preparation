# How do you handle API errors globally in frontend

## Detailed explanation

How do you handle API errors globally in frontend is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle api errors globally in frontend affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle API errors globally in a React application?
- **The Engine Mechanism (Why it behaves this way):** Global error handling uses HTTP client interceptors (Axios response interceptors or fetch wrappers) to catch all API errors in one place. The interceptor classifies errors by status code (401 for auth, 403 for permissions, 422 for validation, 500 for server errors) and routes them to appropriate handlers: toast notifications, redirect to login, or passing structured error data to the calling component.
- **The Unforgettable Mental Model:** The **Air Traffic Control Tower**. Every plane (API request) is monitored from one central tower (error interceptor). When a plane has trouble (error), the tower directs it to the right runway — emergency landing (500 → error page), gate change (401 → login), or minor delay (422 → validation messages).
- **The Trap:** Handling all errors the same way with a generic "Something went wrong" toast. Different error types need different responses — 401 needs re-auth, 422 needs field-level validation display, 500 needs retry options.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement global error handling through HTTP client interceptors. A response interceptor catches all API errors and routes them by status code: 401 triggers token refresh or login redirect, 403 shows an unauthorized page, 422 extracts validation errors for form display, 5xx shows a retry toast, and network errors show connectivity messages. Individual API calls can still override this behavior for specific handling, but the interceptor provides sensible defaults for all requests."

#### How do you differentiate between error types in a global handler?
- **The Engine Mechanism (Why it behaves this way):** Error differentiation uses HTTP status codes and response body structure. 4xx errors are client-side (bad request, unauthorized, forbidden, not found, validation error). 5xx errors are server-side (internal error, bad gateway, service unavailable). Network errors (no status code) indicate connectivity issues. The interceptor checks `response.status` and parses `response.data` to extract error messages and codes.
- **The Unforgettable Mental Model:** The **Hospital Triage System**. Green tag (4xx) — the patient caused the issue, needs guidance. Red tag (5xx) — the hospital has a problem, needs internal fix. Black tag (network error) — the ambulance can't reach the hospital, check the roads.
- **The Trap:** Only checking status codes without parsing the response body. Many backends include structured error responses with machine-readable error codes (`error_code: "VALIDATION_FAILED"`) that enable more precise frontend handling than status codes alone.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I differentiate errors in two layers. First, by HTTP status code — 4xx for client errors, 5xx for server errors, and no status for network failures. Second, by parsing the response body for structured error data. Many backends include an `error_code` field that provides more specific classification than status codes alone. For example, a 400 could be 'INVALID_EMAIL' or 'PASSWORD_TOO_SHORT' — the error code lets me show field-specific messages instead of generic error text."

#### How do you display validation errors from a global handler?
- **The Engine Mechanism (Why it behaves this way):** Validation errors (typically 422) include field-level error details in the response body. The global handler extracts these errors and either: (1) dispatches them to a global error store that form components subscribe to, (2) passes them to a callback that the calling component provides, or (3) throws a structured error object that the calling component catches and maps to form fields.
- **The Unforgettable Mental Model:** The **Teacher's Red Pen**. Instead of just saying "your essay is wrong" (generic error), the teacher marks exactly which sentences have problems and what's wrong with each one (field-level validation errors). The student knows precisely what to fix.
- **The Trap:** Showing validation errors as a global toast. Validation errors are context-specific — they belong next to the form fields they relate to. A global toast loses the connection between error and field.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For validation errors (422), I extract the field-level error map from the response body and handle it differently from other errors. I use a callback pattern where the calling component provides an `onValidationError` handler that receives the error map. The handler maps errors to form fields using a library like React Hook Form's `setError()`. This keeps validation errors contextual — they appear next to the relevant fields, not as a disconnected global notification."

#### How do you handle network errors globally?
- **The Engine Mechanism (Why it behaves this way):** Network errors occur when the request never reaches the server — DNS failure, no internet, CORS rejection, or server unreachable. These errors don't have HTTP status codes. The global handler catches them as exceptions (fetch throws, Axios rejects) and displays user-friendly connectivity messages. Retry logic with exponential backoff can automatically retry transient network failures.
- **The Unforgettable Mental Model:** The **Disconnected Phone Line**. You dial the number (make request), but the line is dead (network error). You can't tell if the person moved, the line is cut, or your phone is broken — you just know the connection failed. The solution: check your connection and try again.
- **The Trap:** Treating network errors the same as server errors. Network errors mean the request never reached the server — retrying might work. Server errors (5xx) mean the server received but failed — retrying might not help and could worsen the situation.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Network errors are caught as exceptions since they have no HTTP status. I display a connectivity-focused message — 'Check your internet connection' with a retry button. I implement automatic retry with exponential backoff for transient network failures (up to 3 attempts). For persistent failures, I show an offline banner and queue mutations locally to retry when connectivity is restored. I distinguish network errors from server errors since the recovery strategy differs — network errors benefit from retry, server errors may need escalation."

#### How do you prevent error handling from interfering with specific API calls?
- **The Engine Mechanism (Why it behaves this way):** Some API calls need custom error handling (e.g., a login form that displays errors inline rather than as a toast). The global handler supports an opt-out mechanism: API calls can set a flag like `skipGlobalError: true` or `handleErrors: false` in the request config. The interceptor checks this flag and skips global handling, letting the calling component manage errors itself.
- **The Unforgettable Mental Model:** The **VIP Lane at the Airport**. Most passengers go through standard security (global error handling), but some have special arrangements (custom error handling) that bypass the standard process. The system supports both paths.
- **The Trap:** Making global error handling mandatory with no opt-out. Some calls need custom handling — login forms need inline errors, file uploads need progress-specific error messages, and background sync calls should fail silently.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I build opt-out into the global error handler. API calls can set `skipGlobalError: true` in their request config to bypass global handling. This is essential for login forms (which need inline error display), file uploads (which need progress-specific error messages), and background operations (which should fail silently with retry). The default is global handling — opt-out is explicit and documented, so developers know when to use it."

#### How do you test global error handling?
- **The Engine Mechanism (Why it behaves this way):** Testing global error handling involves mocking HTTP responses for each error scenario and verifying the correct behavior: 401 triggers auth flow, 422 extracts validation errors, 500 shows retry toast, network errors show connectivity message. Tests use MSW or jest mock to simulate responses and assert on UI changes, navigation, or dispatched actions.
- **The Unforgettable Mental Model:** The **Crash Test Dummy**. You deliberately crash the car (simulate errors) in controlled conditions to verify the safety systems (error handlers) work correctly — airbags deploy (error messages show), seatbelts lock (redirects happen), and alarms sound (alerts trigger).
- **The Trap:** Testing error handling by modifying real API responses. This is slow, flaky, and doesn't cover edge cases. Use network-level mocking (MSW) to simulate exact error responses deterministically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test global error handling using MSW to mock each error scenario at the network level. I write test cases for: 401 responses (verify redirect to login), 422 responses (verify validation errors map to form fields), 500 responses (verify retry toast appears), and network errors (verify connectivity message). I also test the opt-out mechanism by making a request with `skipGlobalError: true` and verifying no global error UI appears. Tests assert on UI elements, navigation, and dispatched actions."

#### What would you monitor for global error handling in production?
- **The Engine Mechanism (Why it behaves this way):** Global error monitoring tracks error rates by status code, error frequency by endpoint, unhandled error crashes, and the ratio of handled-to-unhandled errors. Sentry or similar tools capture frontend errors with stack traces. Dashboard metrics show error trends and help identify problematic endpoints or deployments.
- **The Unforgettable Mental Model:** The **Weather Station**. It tracks storm frequency (error rates), which areas get hit most (endpoint error frequency), whether the warning system worked (handled vs unhandled), and whether storms are increasing (error trends after deployments).
- **The Trap:** Only monitoring handled errors. Unhandled errors (ones that crash the app or show blank screens) are the most critical — they indicate gaps in the global error handling coverage.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor error rates by status code to identify which error types are most common, error frequency by endpoint to find problematic APIs, and the ratio of handled-to-unhandled errors to verify our global handler is catching everything. I use Sentry for frontend error tracking with stack traces and user context. I also set up alerts for error rate spikes after deployments — a sudden increase in 500 errors often indicates a broken backend deployment."

## 8. Active recall test

1. **How does a response interceptor enable global error handling?**
   - **Explanation:** A response interceptor runs automatically for every API response (success or error). In the error handler, it inspects the error's status code and response body, then routes to appropriate handlers — 401 to auth flow, 422 to validation display, 500 to retry toast, network errors to connectivity messages. This centralizes error logic so no component needs to duplicate it.

2. **What is the difference between 4xx and 5xx error handling?**
   - **Explanation:** 4xx errors are client-side — the request was malformed, unauthorized, or invalid. Handling focuses on user guidance (re-login, fix form input, check permissions). 5xx errors are server-side — the backend failed. Handling focuses on retry options, graceful degradation, and alerting the team. The recovery strategies differ fundamentally.

3. **Why should validation errors not be shown as global toasts?**
   - **Explanation:** Validation errors are field-specific — they relate to particular form inputs. Showing them as a global toast disconnects the error from the field that caused it. Instead, validation errors should be mapped to their corresponding form fields and displayed inline, so users know exactly what to fix.

4. **How do you allow specific API calls to bypass global error handling?**
   - **Explanation:** Add an opt-out flag like `skipGlobalError: true` to the request configuration. The response interceptor checks this flag before applying global error handling. If set, the error is passed through to the calling component without triggering global UI (toasts, redirects). This is essential for login forms, file uploads, and background operations.

5. **How do you handle network errors differently from server errors?**
   - **Explanation:** Network errors (no HTTP status, request never reached server) benefit from automatic retry with exponential backoff — the connection might be temporarily down. Server errors (5xx, request reached server but failed) may not benefit from retry — the server itself is broken. Network errors show connectivity messages; server errors show retry options and may trigger alerts.

6. **How do you test global error handling deterministically?**
   - **Explanation:** Use MSW (Mock Service Worker) to mock HTTP responses at the network level. Create handlers for each error scenario (401, 422, 500, network error) and write tests that make API calls, trigger the mocked errors, and assert on the resulting UI changes, navigation, or dispatched actions. This is fast, deterministic, and covers all edge cases.

7. **What is the most important error metric to monitor in production?**
   - **Explanation:** The ratio of handled-to-unhandled errors. Handled errors are caught by the global interceptor and show appropriate UI. Unhandled errors crash the app or show blank screens — they indicate gaps in error handling coverage. A high unhandled rate means the global handler needs to be expanded to catch more error types.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle API errors globally in frontend in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle API errors globally in frontend in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
