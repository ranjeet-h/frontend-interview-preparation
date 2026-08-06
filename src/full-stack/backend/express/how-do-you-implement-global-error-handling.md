# How do you implement global error handling

## Detailed explanation

How do you implement global error handling is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you implement global error handling by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you implement global error handling affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement global error handling in Express?
- **The Engine Mechanism (Why it behaves this way):** Register a 4-parameter error-handling middleware at the END of the middleware stack (after all routes): `app.use((err, req, res, next) => { const status = err.statusCode || 500; const message = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message; logger.error(err, { requestId: req.requestId }); res.status(status).json({ error: message }); });`. This catches all errors passed via `next(err)` or thrown synchronously. For async errors, use an asyncHandler wrapper. Place a 404 handler before the error handler to catch unmatched routes.
- **The Unforgettable Mental Model:** The **Safety Net**. Everything above the error handler is the trapeze act (routes, middleware). If anyone falls (throws an error), the safety net (error handler) catches them. The net is placed at the very bottom — after all the acts.
- **The Trap:** Placing the error handler before routes — it catches nothing because there are no errors to catch yet. Also, forgetting async error handling — Express 4 doesn't catch rejected promises automatically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I place a global error handler at the very end of the middleware stack — after all routes and a 404 catch-all. It's a 4-parameter function that catches errors passed via next(err) or thrown synchronously. I log the full error internally, return a safe generic response to the client, and set the appropriate status code. For async errors, I wrap all async route handlers with an asyncHandler utility. The error handler is the last line of defense — nothing should slip past it."

#### What is the difference between a 404 handler and an error handler?
- **The Engine Mechanism (Why it behaves this way):** A 404 handler is a regular 3-parameter middleware that catches unmatched routes: `app.use((req, res) => res.status(404).json({ error: 'Not found' }))`. It runs when no route matches the request. An error handler is a 4-parameter middleware that catches errors: `app.use((err, req, res, next) => ...)`. It runs when `next(err)` is called or a sync error is thrown. Order: routes → 404 handler → error handler. The 404 handler creates an error object and passes it to the error handler: `app.use((req, res, next) => { next(new AppError('Not found', 404)); })`.
- **The Unforgettable Mental Model:** **Wrong Address vs. House Fire**. 404 is "this address doesn't exist" (no matching route). Error handler is "the house is on fire" (something went wrong during processing). Both need different responses.
- **The Trap:** Having the 404 handler send a response directly instead of passing to the error handler. This bypasses centralized error logging and formatting.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The 404 handler catches unmatched routes — requests that don't match any defined route. The error handler catches actual errors — exceptions and next(err) calls. I have the 404 handler create an AppError with status 404 and pass it to the error handler via next(), so all errors go through the same logging and formatting pipeline. The order is: routes, then 404 handler, then error handler."

#### How do you create a custom error class?
- **The Engine Mechanism (Why it behaves this way):** Extend the built-in Error class: `class AppError extends Error { constructor(message, statusCode) { super(message); this.statusCode = statusCode; this.isOperational = true; Error.captureStackTrace(this, this.constructor); } }`. Usage: `throw new AppError('User not found', 404)`. The `isOperational` flag distinguishes expected errors (validation, not found) from programmer errors (bugs). In the error handler, operational errors return specific messages; programmer errors return generic 500 responses. `Error.captureStackTrace` removes the constructor from the stack trace.
- **The Unforgettable Mental Model:** The **Color-Coded Alert System**. Operational errors are yellow alerts (expected, handle gracefully). Programmer errors are red alerts (unexpected, log fully, respond generically). The color (isOperational) tells the error handler how to respond.
- **The Trap:** Not calling `super(message)` — this breaks the Error prototype chain and loses the stack trace. Also, not setting `isOperational` makes it impossible to distinguish error types in the handler.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create an AppError class that extends Error with statusCode and isOperational properties. Operational errors (validation, not found) have isOperational: true and return specific messages. Programmer errors (bugs) have isOperational: false and return generic 500 responses. I call super(message) to preserve the stack trace and use Error.captureStackTrace to clean it up. This pattern gives me consistent error creation and handling across the entire app."

#### How do you handle errors in async route handlers?
- **The Engine Mechanism (Why it behaves this way):** Express 4 doesn't catch async errors automatically. Use a wrapper: `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`. Apply to all async routes: `app.get('/users', asyncHandler(async (req, res) => { const users = await User.find(); res.json(users); }))`. The wrapper catches any rejected promise and passes it to next(err), which triggers the error handler. Alternatively, use try/catch in every handler, but the wrapper is cleaner and eliminates boilerplate.
- **The Unforgettable Mental Model:** The **Automatic Parachute**. Without the wrapper, async errors are like skydiving without a parachute — you crash. The wrapper is the automatic parachute that deploys when you fall, safely landing you in the error handler.
- **The Trap:** Forgetting to wrap an async handler — a single unwrapped async route can crash the entire Node process with an unhandled promise rejection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use an asyncHandler wrapper on every async route. It catches rejected promises and passes them to next(err), ensuring no async error crashes the process. The wrapper is a one-liner: Promise.resolve(fn(req, res, next)).catch(next). I keep it in a utils file and import it wherever needed. Express 5 will handle this natively, but until then, the wrapper is essential. I also have a CI rule that catches unwrapped async handlers."

#### How do you ensure the error handler never crashes?
- **The Engine Mechanism (Why it behaves this way):** The error handler itself must be bulletproof: (1) Wrap error handler logic in try/catch. (2) Always send a response — even if logging fails. (3) Never throw from the error handler. (4) Use safe defaults: `const status = err.statusCode || 500`. (5) Handle the case where headers are already sent: `if (res.headersSent) return next(err);`. (6) Log errors asynchronously so logging failures don't block the response. If the error handler itself fails, Node.js will crash the process.
- **The Unforgettable Mental Model:** The **Last Lifeboat**. The error handler is the last lifeboat on a sinking ship. If the lifeboat itself has a hole (crashes), everyone drowns. It must be the most reliable component on the ship.
- **The Trap:** Doing complex operations in the error handler (database queries, external API calls) that can themselves fail. Keep the error handler simple: log, respond, done.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The error handler must be bulletproof because it's the last line of defense. I wrap its logic in try/catch, always send a response even if logging fails, and check if headers are already sent before responding. I keep it simple — log the error and return a safe response. I don't do database queries or external API calls in the error handler because those can fail too. If the error handler crashes, the entire process goes down."

## 8. Active recall test

1. **Where should the global error handler be placed?**
   - **Explanation:** At the very end of the middleware stack, after all routes and the 404 catch-all handler. It has a 4-parameter signature (err, req, res, next).

2. **What's the difference between a 404 handler and an error handler?**
   - **Explanation:** 404 handler catches unmatched routes (no route matched). Error handler catches actual errors (next(err) or thrown). 404 handler should pass errors to the error handler via next().

3. **What is the isOperational flag on custom errors?**
   - **Explanation:** It distinguishes expected operational errors (validation, not found) from unexpected programmer errors (bugs). Operational errors get specific messages; programmer errors get generic 500 responses.

4. **Why use an asyncHandler wrapper?**
   - **Explanation:** Express 4 doesn't catch rejected promises. The wrapper catches async errors and passes them to next(err), preventing unhandled promise rejections that crash the Node process.

5. **How do you make the error handler itself crash-proof?**
   - **Explanation:** Wrap in try/catch, always send a response, check if headers are already sent, use safe defaults, and avoid complex operations (DB queries, API calls) that can fail.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you implement global error handling in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you implement global error handling in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
