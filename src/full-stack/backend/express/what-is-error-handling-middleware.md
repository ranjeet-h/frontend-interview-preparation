# What is error-handling middleware

## Detailed explanation

What is error-handling middleware is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is error-handling middleware by linking what it is, why it exists, and how it fails in production.

## 2. Problem it solves

It prevents shallow interview answers and production mistakes by forcing you to reason about correctness, security, performance, maintainability, and frontend/backend contract behavior.

## 3. Core idea

- Define the concept in backend terms.
- Explain the problem it solves.
- Show where it appears in real services.
- Call out security, performance, or reliability impact.
- Compare it with nearby concepts.

## 4. Visual / analogy

```txt
Request/API/service -> concept applied -> safer production behavior
```

## 5. Minimal example

```txt
Input  -> validate
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is error-handling middleware affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is error-handling middleware in Express?
- **The Engine Mechanism (Why it behaves this way):** Error-handling middleware is a special middleware function with four parameters: `(err, req, res, next)`. Express identifies error handlers by the presence of the first `err` parameter. It is only invoked when an error is passed via `next(err)` or thrown synchronously in a route handler. Error handlers must be registered AFTER all routes and other middleware. When triggered, Express skips all remaining regular middleware and jumps directly to the next error handler. Multiple error handlers can be chained — calling `next(err)` in an error handler passes to the next one.
- **The Unforgettable Mental Model:** The **Emergency Room**. Regular middleware is the hospital lobby and departments. When a patient arrives with a critical condition (error), they bypass everything and go straight to the ER (error handler). The ER doctor (error handler) assesses, treats, and decides whether to discharge (send response) or transfer to a specialist (next error handler).
- **The Trap:** Placing error-handling middleware before routes — it will never be triggered because there are no errors to catch yet. Also, using 3 parameters instead of 4 — Express won't recognize it as an error handler.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Error-handling middleware is a 4-parameter function (err, req, res, next) that Express invokes only when an error is passed via next(err) or thrown synchronously. It must be registered after all routes and regular middleware. When triggered, Express skips all remaining regular middleware and jumps to the error handler. I use it to log errors, format error responses, and ensure sensitive details like stack traces are never exposed in production."

#### How do you trigger error-handling middleware?
- **The Engine Mechanism (Why it behaves this way):** There are three ways: (1) **next(err)** — explicitly pass an error to the next error handler: `next(new Error('Not found'))`. (2) **Synchronous throw** — throwing in a sync route handler is automatically caught: `throw new Error('Bad request')`. (3) **Async wrapper** — in async handlers, catch errors and pass them: `try { await db.query(); } catch (err) { next(err); }`. Note that Express 4 does NOT automatically catch async errors — a rejected promise without try/catch crashes the process. Express 5 will handle this natively.
- **The Unforgettable Mental Model:** The **Fire Alarm**. You can pull the alarm manually (next(err)), the building's sensors can detect smoke automatically (sync throw), or you need to manually trigger it for electrical fires (async try/catch + next(err)).
- **The Trap:** Throwing in an async handler without try/catch. `throw new Error()` inside an async function creates a rejected promise, which Express 4 doesn't catch — it crashes the process.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: You trigger error handlers three ways: calling next(err) explicitly, throwing synchronously in a route handler, or catching async errors and passing them to next(). The critical gotcha is that Express 4 doesn't catch async errors automatically — you must wrap async handlers in try/catch or use an asyncHandler wrapper. I always use the wrapper pattern to ensure no async error slips through."

#### What should error-handling middleware do in production?
- **The Engine Mechanism (Why it behaves this way):** In production, error-handling middleware should: (1) **Log the error** — send to a logging service (Winston, Pino, Sentry) with full context: stack trace, request details, user ID. (2) **Return a safe response** — send a generic error message without stack traces or internal details: `res.status(500).json({ error: 'Internal server error' })`. (3) **Categorize errors** — distinguish between operational errors (expected, like validation failures) and programmer errors (bugs, like null reference). (4) **Set appropriate status codes** — 400 for client errors, 401 for auth, 403 for forbidden, 404 for not found, 500 for server errors. (5) **Never crash** — the error handler should always send a response, never re-throw.
- **The Unforgettable Mental Model:** The **Customer Service Desk**. When something goes wrong, the desk agent (error handler) apologizes to the customer (safe response), logs the complaint internally (logging service), categorizes the issue (error type), and never tells the customer about the internal chaos (no stack traces).
- **The Trap:** Sending stack traces or internal error details to the client in production. This exposes your codebase structure, database schema, and potential attack vectors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: In production, error-handling middleware has three jobs: log the full error with context to a monitoring service, return a safe generic response to the client without stack traces or internal details, and set the appropriate HTTP status code. I categorize errors as operational (expected, like validation failures) vs programmer errors (bugs), and handle them differently. Operational errors get specific messages; programmer errors get generic 500 responses with full internal logging."

#### How do you handle different error types?
- **The Engine Mechanism (Why it behaves this way):** Create a custom error class hierarchy: `class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; this.isOperational = true; } }`. Then in the error handler, check `err.isOperational` — operational errors (validation, not found) return specific messages with their status code. Programmer errors (bugs, null references) log fully but return generic 500 responses. You can also check `err.statusCode` or `err.type` for more granular handling. Known errors like `CastError` (Mongoose) or `JsonWebTokenError` get specific handling.
- **The Unforgettable Mental Model:** The **Triage System**. The ER doctor (error handler) sorts patients by severity — minor injuries (validation errors) get quick treatment with specific instructions, critical conditions (server errors) get full attention but the family (client) only gets a general update.
- **The Trap:** Treating all errors the same. A validation error (400) and a database connection failure (500) need different responses — one tells the client what to fix, the other says "try again later."
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use a custom AppError class with a statusCode and isOperational flag. Operational errors like validation failures or not-found errors have specific status codes and messages. Programmer errors like null references or database failures get logged fully but return generic 500 responses. In the error handler, I check isOperational to decide whether to return specific details or a generic message. I also handle known library errors like Mongoose CastError or JWT errors with specific responses."

#### Can you have multiple error handlers?
- **The Engine Mechanism (Why it behaves this way):** Yes — Express supports multiple error handlers in sequence. The first error handler can handle specific error types and call `next(err)` for others it doesn't handle. Common pattern: (1) Specific error handler for known errors (validation, auth): checks `err instanceof ValidationError` and returns 400. (2) General error handler for everything else: logs and returns 500. Each error handler that doesn't fully handle the error must call `next(err)` to pass it forward. The last error handler should always send a response.
- **The Unforgettable Mental Model:** The **Specialist Referral Chain**. The first doctor (specific error handler) treats what they specialize in. If it's outside their expertise, they refer to the next specialist (next error handler). The last doctor (general error handler) handles everything that wasn't caught earlier.
- **The Trap:** Forgetting to call `next(err)` in an error handler that doesn't fully handle the error. The error stops propagating and the request hangs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, you can chain multiple error handlers. I typically have a specific handler first that checks for known error types like validation errors or JWT errors and returns appropriate responses. If it doesn't recognize the error, it calls next(err) to pass it to the general handler. The general handler logs everything and returns a generic 500. The key rule: every error handler must either send a response or call next(err) — never both, never neither."

## 8. Active recall test

1. **How does Express identify error-handling middleware?**
   - **Explanation:** By the 4-parameter signature `(err, req, res, next)`. The presence of the first `err` parameter tells Express this is an error handler, not regular middleware.

2. **Where should error-handling middleware be registered?**
   - **Explanation:** After all routes and regular middleware. It catches errors that bubble up from preceding code. If placed before routes, it has nothing to catch.

3. **What are the three ways to trigger an error handler?**
   - **Explanation:** (1) `next(err)` explicitly, (2) synchronous `throw` in a route handler, (3) catching async errors and passing them to `next(err)`.

4. **Why should you never send stack traces in production?**
   - **Explanation:** Stack traces expose internal code structure, file paths, database queries, and potential attack vectors. They should only be logged internally, never sent to clients.

5. **What is the purpose of the isOperational flag on custom errors?**
   - **Explanation:** It distinguishes between expected operational errors (validation failures, not found) that can return specific messages, and programmer errors (bugs) that should return generic 500 responses with full internal logging.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is error-handling middleware in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is error-handling middleware in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
