# How do you create middleware

## Detailed explanation

How do you create middleware is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you create middleware by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you create middleware affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you create middleware in Express?
- **The Engine Mechanism (Why it behaves this way):** Middleware is a function with the signature `(req, res, next)`. It can be registered with `app.use(middleware)` for all routes or `app.use('/path', middleware)` for a specific path prefix. Inside the function, you can read/modify `req` and `res`, perform async operations, and either send a response (terminating the chain) or call `next()` to continue. For async middleware, you must handle errors with try/catch and pass them to `next(err)`. Middleware can also be created as a factory function that returns middleware: `const myMiddleware = (options) => (req, res, next) => { ... }`.
- **The Unforgettable Mental Model:** The **Filter Screen**. Water (request) flows through a mesh screen (middleware). The screen catches debris (validates input), adds minerals (enriches req), or blocks flow entirely (rejects unauthorized). Clean water continues downstream.
- **The Trap:** Forgetting to handle async errors. An unhandled promise rejection in middleware crashes the Node process. Always wrap async operations in try/catch and call `next(err)` on failure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express middleware is a function with the signature (req, res, next). I register it with app.use() for global middleware or on specific routes for scoped middleware. Inside, I can inspect or modify req/res, perform async work, and either send a response or call next() to continue. For async middleware, I always wrap operations in try/catch and pass errors to next(err) to prevent unhandled promise rejections."

#### What are the different types of middleware in Express?
- **The Engine Mechanism (Why it behaves this way):** Express has five types: (1) **Application-level** — `app.use()` or `app.METHOD()`, runs for all or specific routes. (2) **Router-level** — `router.use()`, works like application middleware but bound to an express.Router instance. (3) **Error-handling** — `(err, req, res, next)` with four arguments, catches errors passed via `next(err)`. (4) **Built-in** — `express.json()`, `express.urlencoded()`, `express.static()`, `express.raw()`, `express.text()`. (5) **Third-party** — installed via npm: `cors`, `helmet`, `morgan`, `compression`, `multer`, etc.
- **The Unforgettable Mental Model:** The **Toolbox Categories**. Built-in tools come with the box (express.json()), third-party tools you buy separately (helmet, cors), custom tools you forge yourself (auth middleware), and specialty tools for specific jobs (error handlers).
- **The Trap:** Confusing error-handling middleware with regular middleware. Error handlers have 4 parameters and are only invoked when an error is passed — they don't run in the normal middleware flow.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express has five middleware types: application-level (app.use), router-level (router.use), error-handling (4-parameter signature), built-in (express.json, express.static), and third-party (cors, helmet, morgan). I use built-in for body parsing and static files, third-party for common concerns like security and logging, and custom application or router-level middleware for business-specific logic like authentication and authorization."

#### How do you create async middleware?
- **The Engine Mechanism (Why it behaves this way):** Async middleware uses `async/await` or returns a Promise. Since Express 4 doesn't catch rejected promises automatically, you must wrap async logic in try/catch and call `next(err)` on failure: `const asyncMiddleware = async (req, res, next) => { try { await someAsyncOp(); next(); } catch (err) { next(err); } }`. Alternatively, use a wrapper function: `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`. Express 5 will handle async errors natively.
- **The Unforgettable Mental Model:** The **Safety Net**. Async operations are like trapeze artists — if they miss (reject), the safety net (try/catch + next(err)) catches them. Without the net, they crash to the ground (unhandled rejection crashes the process).
- **The Trap:** Writing `app.use(async (req, res, next) => { await something(); next(); })` without try/catch. If `await something()` rejects, the error is unhandled and crashes the process.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Async middleware requires explicit error handling because Express 4 doesn't catch rejected promises. I wrap async operations in try/catch and call next(err) on failure, or use an asyncHandler wrapper that catches rejections automatically. The wrapper pattern is cleaner — it wraps the handler function and catches any promise rejection, passing it to next(). Express 5 will handle this natively, but until then, the wrapper is essential."

#### Can middleware be conditionally applied?
- **The Engine Mechanism (Why it behaves this way):** Yes — middleware can be conditionally applied in several ways: (1) **Path-based** — `app.use('/admin', adminMiddleware)` only runs for `/admin/*` routes. (2) **Conditional inside middleware** — `if (req.path.startsWith('/api/v2')) { return next(); }` skips middleware for certain paths. (3) **Dynamic mounting** — `if (process.env.NODE_ENV === 'production') app.use(rateLimiter)`. (4) **Route-level** — apply middleware only to specific routes: `app.get('/protected', authMiddleware, handler)`. (5) **Regex paths** — `app.use(/^\/api\/v[12]/, middleware)` matches multiple path patterns.
- **The Unforgettable Mental Model:** The **Smart Gate**. The gate checks the visitor's destination (path), time of day (environment), and credentials (conditions) before deciding which security checkpoint to send them through.
- **The Trap:** Overcomplicating conditional logic inside middleware. If a middleware needs many conditions, it's probably doing too much and should be split into separate, focused middleware.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware can be conditionally applied in several ways. I prefer path-based mounting for clarity — app.use('/admin', adminMiddleware) is self-documenting. For environment-specific middleware, I conditionally mount at startup. If I need runtime conditions, I check them inside the middleware and call next() early to skip. But I avoid complex conditional logic in middleware — if it needs many branches, it should be split into focused middleware."

#### How do you pass data between middleware?
- **The Engine Mechanism (Why it behaves this way):** Middleware communicates by attaching properties to the `req` object. Since `req` is the same object passed through the entire middleware chain, any property added by one middleware is available to all downstream middleware and route handlers: `req.user = decodedToken`, `req.startTime = Date.now()`, `req.cache = cachedData`. You can also attach methods: `req.isAdmin = () => req.user.role === 'admin'`. For sharing data across requests (not recommended), you'd use external storage like Redis or a database.
- **The Unforgettable Mental Model:** The **Backpack**. Each middleware puts items in the traveler's backpack (req object). The next middleware can see and use everything that was packed before. But each traveler (request) gets their own backpack — nothing is shared between requests.
- **The Trap:** Attaching sensitive data to `req` without considering that it persists for the entire request lifecycle. Also, using `req` to share data between requests — each request gets a fresh `req` object.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Middleware passes data by attaching properties to the req object. Auth middleware sets req.user, logging middleware sets req.startTime, and so on. Since req is the same object through the entire chain, downstream middleware and handlers can access everything. I'm careful about what I attach — only data that downstream code actually needs, and never sensitive data that shouldn't persist. Each request gets its own req object, so there's no cross-request data sharing."

## 8. Active recall test

1. **What is the middleware function signature?**
   - **Explanation:** `(req, res, next)` — request object, response object, and a callback to pass control to the next middleware. Error-handling middleware adds a first parameter: `(err, req, res, next)`.

2. **How do you register global middleware?**
   - **Explanation:** `app.use(middleware)` — it runs for every incoming request before any route handlers.

3. **Why must async middleware use try/catch?**
   - **Explanation:** Express 4 doesn't automatically catch rejected promises. Without try/catch and next(err), an async error becomes an unhandled promise rejection that crashes the Node process.

4. **How do you create a middleware factory function?**
   - **Explanation:** A function that returns middleware: `const myMiddleware = (options) => (req, res, next) => { /* use options here */ next(); }`. This enables configurable middleware.

5. **How does middleware share data with downstream handlers?**
   - **Explanation:** By attaching properties to the `req` object. Since req is passed through the entire chain, any property added by one middleware is available to all subsequent middleware and route handlers.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you create middleware in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you create middleware in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
