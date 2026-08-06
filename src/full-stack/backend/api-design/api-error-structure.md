# API Error Structure

## Detailed explanation

Define consistent error code, message, field errors, request id, and retry hints. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Error structure is how backend teaches frontend what to do next.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, api error structure should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What is a consistent API error structure?
- **The Engine Mechanism (Why it behaves this way):** A consistent error structure provides machine-readable error codes, human-readable messages, and optional field-level details: `{ success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input", details: [{ field: "email", message: "Invalid email format" }], requestId: "req_abc123", retryable: false } }`. This enables the frontend to display appropriate messages, highlight specific fields, and decide whether to retry.
- **The Unforgettable Mental Model:** The **Detailed Error Ticket**. Instead of just "something went wrong," the ticket tells you exactly what failed (code), explains it in plain language (message), points to the specific problem (field details), and gives you a reference number (requestId) for support.
- **The Trap:** Returning only a generic message like "An error occurred" — this gives the frontend no information to display meaningful feedback to the user.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a consistent error structure with a machine-readable code, human-readable message, optional field-level details, a requestId for support, and a retryable flag. This gives the frontend everything it needs: the code for programmatic handling, the message for display, field details for inline validation, and the retryable flag for retry logic."

#### What fields should the error structure contain?
- **The Engine Mechanism (Why it behaves this way):** Required: `code` (machine-readable string like "VALIDATION_ERROR"), `message` (human-readable string). Optional: `details` (array of field-level errors), `requestId` (for support tracing), `retryable` (boolean for retry logic), `documentationUrl` (link to error docs). The code is stable across versions; the message can be localized.
- **The Unforgettable Mental Model:** The **Error Diagnosis Report**. The diagnosis code (code) tells the system what's wrong, the explanation (message) tells the user, the symptom details (field errors) pinpoint the issue, and the case number (requestId) enables support follow-up.
- **The Trap:** Using the message as the machine-readable identifier — messages change with localization and wording updates, but codes should be stable for programmatic handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The error structure has a stable machine-readable code (like 'VALIDATION_ERROR'), a human-readable message for display, optional field-level details for inline errors, a requestId for support tracing, and a retryable flag. The code is the programmatic identifier — it never changes. The message can be localized and updated independently."

#### How does error structure affect frontend error handling?
- **The Engine Mechanism (Why it behaves this way):** A consistent error structure enables a centralized error handler that maps error codes to UI behaviors: VALIDATION_ERROR → highlight fields, UNAUTHORIZED → redirect to login, RATE_LIMITED → show countdown, SERVER_ERROR → show generic error with retry button. Without consistency, each endpoint needs custom error handling.
- **The Unforgettable Mental Model:** The **Error Routing Center**. Each error code is a destination address — the handler routes it to the correct UI response: field highlighting, login redirect, retry button, or generic error page.
- **The Trap:** Not handling unknown error codes gracefully — new error codes may be added server-side, and the frontend should have a fallback for unrecognized codes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A consistent error structure enables a centralized error handler that maps codes to UI behaviors. VALIDATION_ERROR triggers field highlighting, UNAUTHORIZED triggers login redirect, RATE_LIMITED shows a countdown, SERVER_ERROR shows a retry button. I also include a fallback for unknown error codes — displaying the message and logging the unknown code for investigation."

#### What error codes should you define?
- **The Engine Mechanism (Why it behaves this way):** Common error codes: `VALIDATION_ERROR` (input validation failed), `UNAUTHORIZED` (authentication required), `FORBIDDEN` (insufficient permissions), `NOT_FOUND` (resource doesn't exist), `CONFLICT` (duplicate or state conflict), `RATE_LIMITED` (too many requests), `INTERNAL_ERROR` (server error), `SERVICE_UNAVAILABLE` (downstream dependency down). Codes are uppercase, underscore-separated, and namespaced by domain if needed.
- **The Unforgettable Mental Model:** The **Error Code Dictionary**. Each code is a standardized term that both backend and frontend agree on — like medical diagnosis codes that map to specific treatments.
- **The Trap:** Creating too many specific error codes — having a unique code for every possible error makes the frontend's error handling complex. Group related errors under broader codes with details for specificity.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I define a core set of error codes: VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, CONFLICT, RATE_LIMITED, INTERNAL_ERROR, and SERVICE_UNAVAILABLE. Codes are uppercase and underscore-separated. For domain-specific errors, I namespace them (e.g., 'PAYMENT_FAILED', 'INVENTORY_INSUFFICIENT'). I avoid creating too many specific codes — broader codes with detailed error objects are easier to handle."

#### How do you handle field-level validation errors?
- **The Engine Mechanism (Why it behaves this way):** Field-level errors are in the `details` array: `[{ field: "email", message: "Invalid email format", code: "INVALID_FORMAT" }, { field: "password", message: "Minimum 8 characters", code: "TOO_SHORT" }]`. The frontend maps field names to form inputs and displays inline errors. Nested fields use dot notation: `address.city`.
- **The Unforgettable Mental Model:** The **Form Correction Sheet**. Each error points to a specific field (field name), explains what's wrong (message), and provides a correction code. The form highlights the problematic fields.
- **The Trap:** Not using dot notation for nested fields — `address.city` is clearer than separate `address` and `city` entries that the frontend can't map to the correct input.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Field-level errors are in a details array with field name, message, and optional code. The frontend maps field names to form inputs for inline error display. Nested fields use dot notation like 'address.city'. This structure enables precise error highlighting without the frontend needing to parse error messages."

#### How do you handle unexpected server errors?
- **The Engine Mechanism (Why it behaves this way):** Unexpected errors return `INTERNAL_ERROR` with a generic message ("An unexpected error occurred") — never expose stack traces or internal details. The `requestId` enables support to trace the error in logs. The `retryable` flag indicates whether the client should retry. Internal details are logged server-side with full context.
- **The Unforgettable Mental Model:** The **Black Box Error Report**. The user sees a generic "something went wrong" message with a reference number. Inside the black box, the full error details are logged for engineers to investigate.
- **The Trap:** Returning stack traces or internal error details to the client — this exposes implementation details and potential security vulnerabilities.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Unexpected errors return INTERNAL_ERROR with a generic message — never stack traces or internal details. The requestId enables support tracing. The retryable flag tells the client whether to retry. Full error details are logged server-side with stack traces, context, and request data. Exposing internal details to clients is a security risk."

#### How do you test API error structure consistency?
- **The Engine Mechanism (Why it behaves this way):** Contract tests verify every error response follows the structure. Tests cover: validation errors (400), authorization errors (401/403), not found (404), conflict (409), rate limiting (429), server errors (500). Schema validation checks all required fields are present. Error code registry tests verify codes are documented.
- **The Unforgettable Mental Model:** The **Error Response Inspector**. Every possible error path is examined to ensure it produces a correctly structured error response with all required fields.
- **The Trap:** Only testing happy-path responses — error responses are where structure inconsistency most commonly creeps in, especially during rapid development.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test every error path: validation (400), authorization (401/403), not found (404), conflict (409), rate limiting (429), and server errors (500). Schema validation verifies all required fields are present. I also maintain an error code registry and test that all returned codes are documented. Error response testing is often neglected but critical for frontend reliability."

#### What logs and metrics would you add for error structure?
- **The Engine Mechanism (Why it behaves this way):** Logs: error returned (code, message, requestId, endpoint, timestamp), unexpected errors (full details), unknown error codes returned. Metrics: error rate by code, error rate by endpoint, average errors per request, unknown error code count. Alerts: error rate spike, new undocumented error codes, high rate of specific errors.
- **The Unforgettable Mental Model:** The **Error Analytics Dashboard**. Error frequency by type, which endpoints produce the most errors, and anomalies like sudden spikes or new error codes.
- **The Trap:** Not tracking unknown error codes — if the frontend receives an undocumented code, it indicates a gap between backend and frontend error handling.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log error responses with code, requestId, endpoint, and timestamp. Metrics track error rate by code and endpoint, and count unknown error codes. I alert on error rate spikes, undocumented error codes, and high rates of specific errors. Unknown error code tracking is important — it indicates gaps between backend error codes and frontend error handling."

## 8. Active recall test

1. **What are the required fields in a consistent error structure?**
   - **Explanation:** `code` (machine-readable string) and `message` (human-readable string) — these enable programmatic handling and user-facing display.

2. **Why separate error code from error message?**
   - **Explanation:** The code is stable for programmatic handling, while the message can be localized, updated, or changed without breaking frontend logic.

3. **How are field-level validation errors represented?**
   - **Explanation:** In a `details` array with objects containing `field` (name), `message` (description), and optionally `code` — enabling inline form error display.

4. **What should unexpected server errors return to the client?**
   - **Explanation:** A generic `INTERNAL_ERROR` code with a generic message — never stack traces or internal details. Full details are logged server-side.

5. **What is the purpose of the requestId in error responses?**
   - **Explanation:** For support tracing — the client can provide the requestId to support, who uses it to find the full error details in server logs.

6. **What does the retryable flag indicate?**
   - **Explanation:** Whether the client should automatically retry the request — true for transient errors (503, rate limiting), false for permanent errors (400, 404).

7. **How are nested field errors represented?**
   - **Explanation:** Using dot notation: `address.city` — this allows the frontend to map the error to the correct nested form input.

8. **Why avoid too many specific error codes?**
   - **Explanation:** Too many codes make frontend error handling complex. Broader codes with detailed error objects are easier to manage and maintain.

9. **What metric indicates a gap between backend and frontend error handling?**
   - **Explanation:** Unknown error code count — if the frontend receives codes it doesn't recognize, the error code registry needs updating.

10. **What should error responses never contain?**
    - **Explanation:** Stack traces, internal implementation details, database errors, or sensitive information — these are security risks and provide no value to the user.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for API Error Structure.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
