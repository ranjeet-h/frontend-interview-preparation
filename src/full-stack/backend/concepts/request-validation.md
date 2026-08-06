# Request Validation

## Detailed explanation

Request validation checks incoming params, query strings, headers, and bodies before business logic runs.

## 1. One-line mental model

Reject bad input at the boundary.

## 2. Problem it solves

Without validation, invalid data reaches services and databases, causing bugs, security issues, and unclear frontend errors.

## 3. Core idea

- Validate type, required fields, format, ranges, enums, and nested objects.
- Use schemas like Zod, Pydantic, Joi, Yup, or JSON Schema.
- Return field-level errors for frontend forms.
- Validate server-side even if frontend validates.
- Do not trust client-controlled fields like role or ownerId.

## 4. Visual / analogy

```txt
Security gate before business logic.
```

## 5. Minimal example

```txt
const body = createUserSchema.parse(req.body);
```

## 6. Real-world example

Registration API validates email, password length, accepted terms, and optional profile fields.

## 7. Common interview questions

#### What is request validation?
- **The Engine Mechanism (Why it behaves this way):** Request validation checks incoming request data — body, query parameters, route params, and headers — against a schema before business logic runs. The backend uses validation libraries (Zod, Joi, Yup, Pydantic, JSON Schema) to define schemas that specify required fields, types, formats, ranges, enums, and nested object structures. When a request arrives, the validation middleware parses the data against the schema. If validation fails, it returns a 400 or 422 response with field-level error details. If validation passes, the validated and typed data is passed to the route handler. This creates a clear boundary between untrusted external input and trusted internal data.
- **The Unforgettable Mental Model:** Request validation is a **security checkpoint** at the building entrance. Everyone and everything is checked before entering — no exceptions.
- **The Trap:** Validating only on the frontend. Client-side validation is for user experience; server-side validation is for security. Any client-side check can be bypassed with curl or Postman.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Request validation checks incoming data against a schema before business logic runs. I use libraries like Zod or Joi to define schemas for types, required fields, formats, ranges, and enums. Validation runs as middleware after body parsing — if it fails, the request is rejected with field-level errors. If it passes, the validated data is passed to the handler. This creates a clear boundary between untrusted external input and trusted internal data. I always validate server-side, even when the frontend validates, because client-side checks can be bypassed."

#### Why does request validation matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Without validation, invalid data reaches services and databases, causing type errors, constraint violations, security vulnerabilities, and unclear frontend errors. Validation catches bad input at the system boundary — the earliest possible point — preventing invalid data from propagating through the application. It provides clear, actionable error messages for frontend forms, protects against injection attacks by rejecting malformed input, enforces business rules at the API level, and makes handlers simpler because they can trust the data they receive.
- **The Unforgettable Mental Model:** Validation is like a **filter in a water pipe**. It catches contaminants before they reach the drinking water — fixing the problem at the source is cheaper and safer than fixing it downstream.
- **The Trap:** Assuming database constraints are enough. Database constraints catch violations but return generic errors. API-level validation provides field-level error messages that frontends can display to users.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Request validation matters because it catches bad input at the system boundary before it reaches business logic. Without it, invalid data causes type errors, constraint violations, and security issues deep in the application where they're harder to debug. Validation provides clear field-level error messages for frontend forms, protects against injection attacks, enforces business rules, and simplifies handlers because they can trust the data they receive. Database constraints are a safety net, but API validation is the first line of defense."

#### What bugs happen when request validation is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor validation causes several production issues. Missing validation allows invalid data into the database — null values in required fields, strings in number columns, dates in the past for future bookings. Overly strict validation rejects valid requests — requiring fields that should be optional, rejecting valid edge-case values. Not validating nested objects allows malformed sub-resources through. Not sanitizing input enables injection attacks (XSS, SQL injection, NoSQL injection). Returning generic validation errors without field details makes frontend error handling impossible.
- **The Unforgettable Mental Model:** Poor validation is like a **sieve with the wrong hole size**. Too big — garbage gets through. Too small — good stuff gets blocked.
- **The Trap:** Trusting client-controlled fields like `role`, `ownerId`, or `isAdmin`. A malicious client can set `role: "admin"` in the request body and escalate privileges if the backend doesn't validate and override these fields.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor validation allows invalid data into the database, rejects valid requests with overly strict rules, and enables injection attacks from unsanitized input. The most dangerous bug is trusting client-controlled fields like role or ownerId — a malicious client can escalate privileges by setting admin roles in the request body. I validate all input at the boundary, never trust client-controlled authorization fields, return field-level error details, and use parameterized queries as a defense-in-depth strategy against injection."

#### How does request validation affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients receive validation error responses (typically 422) with field-level error details that map directly to form inputs. The error body contains paths like `{ "errors": { "email": "Invalid email format", "password": "Minimum 8 characters" } }` that the frontend uses to display errors next to the corresponding fields. The frontend uses these errors to highlight invalid inputs, show error messages, and prevent form submission until all fields pass. Client-side validation provides immediate feedback, but server-side validation errors are the authoritative source of truth.
- **The Unforgettable Mental Model:** Validation errors are like a **teacher's red pen** on a test — they mark exactly which answers are wrong and why, so the student can fix them.
- **The Trap:** Only showing server-side validation errors without client-side validation. Users submit the form, wait for the server response, then see errors — a poor UX compared to immediate client-side feedback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend receives validation errors with field-level details that map to form inputs. The error body contains field paths and messages that the frontend displays next to corresponding inputs. I implement both client-side validation for immediate UX feedback and server-side validation as the authoritative check. Client-side validation catches obvious errors quickly; server-side validation catches everything else and is the source of truth. The frontend should handle both gracefully."

#### How would you test request validation?
- **The Engine Mechanism (Why it behaves this way):** Testing validation involves sending requests with valid and invalid data and verifying correct responses. Test valid data passes validation and reaches the handler. Test missing required fields return field-level errors. Test invalid types (string instead of number), invalid formats (bad email), out-of-range values (age: -1), and invalid enums return appropriate errors. Test nested object validation. Test that validation errors return 400 or 422 with structured error bodies. Test boundary values — minimum length strings, maximum numbers, empty arrays. Test that client-controlled authorization fields are overridden by the server.
- **The Unforgettable Mental Model:** Testing validation is like **testing a quality control machine**. Feed it good products (pass), defective products (reject with specific defect label), and edge cases (verify correct handling).
- **The Trap:** Only testing with valid data. The error paths are where validation bugs hide — missing field checks, incorrect error messages, wrong status codes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test validation with valid data that should pass, and invalid data that should fail with specific field-level errors. I test missing required fields, invalid types, bad formats, out-of-range values, and invalid enums. I test nested objects and boundary values. I verify error responses return 400 or 422 with structured error bodies containing field paths and messages. I also test that client-controlled authorization fields are overridden by the server. The key is testing both the happy path and every error path."

## 8. Active recall test

1. **Explain request validation without looking at notes.**
   - **Explanation:** Request validation checks incoming data (body, query, params, headers) against a schema before business logic runs. It uses libraries like Zod or Joi to define types, required fields, formats, and ranges. Failed validation returns 400/422 with field-level errors. It creates a boundary between untrusted input and trusted internal data.

2. **Give one production bug related to request validation.**
   - **Explanation:** Not validating a client-controlled `role` field allows a malicious user to send `{ "role": "admin" }` in the registration body and create an admin account. The backend trusts the client input instead of enforcing server-side role assignment.

3. **Give one API example where request validation matters.**
   - **Explanation:** A registration endpoint validates email format, password length (min 8), accepted terms (boolean true), and optional profile fields. Invalid email returns `{ "errors": { "email": "Invalid email format" } }` with 422 status.

4. **Explain how a frontend client should handle validation errors.**
   - **Explanation:** The frontend parses the 422 error body for field-level errors and displays them next to corresponding form inputs. It uses client-side validation for immediate feedback and server-side errors as the authoritative source. It highlights invalid fields and prevents submission until errors are resolved.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Request Validation is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Request Validation in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Request Validation in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
