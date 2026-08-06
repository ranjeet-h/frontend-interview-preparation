# How do you handle API errors in MERN

## Detailed explanation

How do you handle API errors in MERN is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you handle api errors in mern affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle API errors across the MERN stack?
- **The Engine Mechanism (Why it behaves this way):** Error flow: (1) **Backend** — Express catches errors in global error handler, returns structured JSON: `{ error: 'message', code: 'VALIDATION_ERROR', details: [{ field: 'email', message: 'Invalid email' }] }`. (2) **API client** — axios interceptor catches non-2xx responses, normalizes errors: `const normalizeError = (err) => ({ message: err.response?.data?.error || 'Network error', code: err.response?.data?.code, details: err.response?.data?.details, status: err.response?.status })`. (3) **Frontend** — TanStack Query or component catches the normalized error, maps it to UI: validation errors show inline messages, auth errors redirect to login, server errors show toast notifications.
- **The Unforgettable Mental Model:** The **Emergency Response Chain**. The backend sounds the alarm (structured error response), the API client translates it (normalizes format), and the frontend dispatches the right response (UI state). Each step has a standardized protocol.
- **The Trap:** Returning different error formats from different endpoints. The frontend needs a consistent error structure to handle errors uniformly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I standardize error handling across the stack. Backend returns structured JSON with message, code, and optional details. The API client normalizes all errors into a consistent format via an interceptor. Frontend maps error codes to UI behaviors — validation errors show inline messages, auth errors redirect to login, server errors show toast notifications. I use shared TypeScript types for error structures so both sides agree on the format."

#### What error response format should you use?
- **The Engine Mechanism (Why it behaves this way):** Standardized format: `{ error: string, code: string, details?: Array<{ field: string, message: string }> }`. Examples: Validation error: `{ error: 'Validation failed', code: 'VALIDATION_ERROR', details: [{ field: 'email', message: 'Invalid email' }] }`. Auth error: `{ error: 'Token expired', code: 'TOKEN_EXPIRED' }`. Not found: `{ error: 'User not found', code: 'NOT_FOUND' }`. Server error: `{ error: 'Internal server error', code: 'SERVER_ERROR' }`. The `code` field enables programmatic error handling on the frontend. The `details` field enables inline form validation.
- **The Unforgettable Mental Model:** The **Error ID Card**. Every error has a name (message), an ID number (code), and sometimes additional info (details). The frontend uses the ID number to decide what to do and the name to show the user.
- **The Trap:** Only returning a message string — the frontend can't programmatically distinguish between error types. Always include a machine-readable code.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a standardized error format with three fields: error (human-readable message), code (machine-readable identifier), and details (field-level validation errors). The code field lets the frontend handle different error types programmatically — TOKEN_EXPIRED triggers a refresh, VALIDATION_ERROR shows inline messages, NOT_FOUND redirects. I define all error codes in a shared constants file so both frontend and backend use the same values."

#### How do you map backend validation errors to frontend form errors?
- **The Engine Mechanism (Why it behaves this way):** Backend returns `{ code: 'VALIDATION_ERROR', details: [{ field: 'email', message: 'Invalid email' }, { field: 'password', message: 'Too short' }] }`. Frontend API client catches this and transforms it into a format the form library understands. For React Hook Form: `const setServerErrors = (details) => { details.forEach(({ field, message }) => { form.setError(field, { type: 'server', message }); }); }`. For TanStack Query: handle in `onError` callback. The field names must match between backend validation schema and frontend form field names.
- **The Unforgettable Mental Model:** The **Translator**. The backend speaks "validation error language" (details array). The translator (API client) converts it to "form library language" (setError calls). Both sides need to agree on the dictionary (field names).
- **The Trap:** Using different field names on frontend and backend — the frontend can't map errors to the correct form fields. Share field name constants.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I map backend validation errors to frontend forms by matching field names. The backend returns a details array with field and message. The frontend API client transforms this into form library calls — for React Hook Form, I call form.setError(field, { message }) for each detail. I share field name constants between frontend and backend so they always match. I also share Zod schemas so validation rules are identical on both sides."

#### How do you handle network errors vs. API errors?
- **The Engine Mechanism (Why it behaves this way):** Network errors (no internet, server down) don't have a response body. API errors (400, 401, 404, 500) have structured responses. Distinguish in the API client: `try { const res = await api.get('/users'); } catch (err) { if (err.response) { /* API error - has response */ handleApiError(err.response.data); } else if (err.request) { /* Network error - no response */ showNetworkError(); } else { /* Other error */ showGenericError(); } }`. Network errors show "check your connection" messages. API errors show specific messages based on the error code.
- **The Unforgettable Mental Model:** The **Two Types of Silence**. Network error is like calling someone whose phone is off (no response at all). API error is like calling someone who says "I can't help you" (clear response, just not what you wanted).
- **The Trap:** Treating all errors the same — showing "Internal server error" for a network disconnect confuses users. Differentiate and show appropriate messages.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I distinguish between network errors (no response from server) and API errors (server responded with an error). Network errors show 'check your connection' messages with a retry button. API errors show specific messages based on the error code — validation errors show field messages, auth errors redirect to login, server errors show generic messages. The API client interceptor handles this distinction by checking if err.response exists."

#### How do you handle errors in TanStack Query?
- **The Engine Mechanism (Why it behaves this way):** TanStack Query provides error state: `const { data, error, isError } = useQuery({ queryKey: ['users'], queryFn: () => api.get('/users') })`. Render based on state: `if (isError) { if (error.code === 'TOKEN_EXPIRED') { refreshToken(); } else if (error.code === 'VALIDATION_ERROR') { showInlineErrors(error.details); } else { showToast(error.message); } }`. For mutations: `const mutation = useMutation({ mutationFn: createUser, onError: (error) => { setServerErrors(error.details); } })`. TanStack Query also supports retry logic: `retry: (failureCount, error) => error.code === 'SERVER_ERROR' && failureCount < 3`.
- **The Unforgettable Mental Model:** The **Error Router**. TanStack Query catches all errors and routes them based on their code. TOKEN_EXPIRED goes to the refresh handler, VALIDATION_ERROR goes to the form handler, everything else goes to the toast handler.
- **The Trap:** Not handling errors in mutations — form submission errors need to be mapped back to form fields, not just shown as generic toasts.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: TanStack Query provides error state out of the box. For queries, I check isError and handle errors based on the error code. For mutations, I use the onError callback to map validation errors back to form fields. I also configure retry logic for transient server errors but not for client errors (400, 401, 404). The key is mapping error codes to specific UI behaviors — TOKEN_EXPIRED triggers refresh, VALIDATION_ERROR shows inline messages, and other errors show toast notifications."

## 8. Active recall test

1. **What is the standardized error response format?**
   - **Explanation:** `{ error: string, code: string, details?: Array<{ field, message }> }`. The code enables programmatic handling, details enable inline form validation.

2. **How do you map backend validation errors to frontend forms?**
   - **Explanation:** Backend returns details array with field and message. Frontend transforms it into form library calls (form.setError). Field names must match between frontend and backend.

3. **How do you distinguish network errors from API errors?**
   - **Explanation:** Check if err.response exists. If yes, it's an API error (server responded). If no but err.request exists, it's a network error (no response). Handle each differently.

4. **How does TanStack Query handle errors?**
   - **Explanation:** Provides isError and error state. For queries, render error UI based on error code. For mutations, use onError callback to map errors to form fields.

5. **Why include a machine-readable error code?**
   - **Explanation:** So the frontend can programmatically handle different error types — TOKEN_EXPIRED triggers refresh, VALIDATION_ERROR shows inline messages, NOT_FOUND redirects.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle API errors in MERN in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle API errors in MERN in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
