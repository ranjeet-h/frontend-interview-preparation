# How do you handle async errors in Express

## Detailed explanation

How do you handle async errors in Express is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle async errors in express by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you handle async errors in express affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you handle async errors in Express?
- **The Engine Mechanism (Why it behaves this way):** Express 4 does NOT automatically catch rejected promises from async route handlers. You have three options: (1) **Try/catch** — wrap async code in try/catch and call `next(err)`: `try { const user = await User.findById(id); } catch (err) { next(err); }`. (2) **Async handler wrapper** — create a utility: `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`, then wrap routes: `app.get('/users', asyncHandler(getUsers))`. (3) **express-async-handler package** — a popular npm package that does the same wrapping. Express 5 will handle async errors natively, making these workarounds unnecessary.
- **The Unforgettable Mental Model:** The **Parachute**. Async code is skydiving — without a parachute (error handling), you crash. The try/catch is your manual ripcord, the wrapper is an automatic deployment system. Either way, you need something to catch you when things go wrong.
- **The Trap:** Writing `app.get('/users', async (req, res) => { const user = await User.findById(req.params.id); res.json(user); })` without error handling. If the database query fails, the rejected promise crashes the entire Node process.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express 4 doesn't catch async errors automatically, so I always use an asyncHandler wrapper. It wraps the route handler and catches any rejected promise, passing it to next(). This eliminates boilerplate try/catch blocks in every route and ensures no async error slips through. The wrapper is simple — Promise.resolve(fn(req, res, next)).catch(next). Express 5 will handle this natively, but until then, the wrapper is non-negotiable in production code."

#### Why doesn't Express 4 catch async errors automatically?
- **The Engine Mechanism (Why it behaves this way):** Express 4 was designed before async/await was widely adopted. Its error catching uses synchronous `try/catch` around middleware execution: `try { middleware(req, res, next); } catch (err) { next(err); }`. This catches synchronous throws but not rejected promises, because the `try/catch` exits before the promise settles. The middleware function returns immediately (with a pending promise), and the `try/catch` has already completed. When the promise later rejects, there's no listener attached, resulting in an unhandled promise rejection.
- **The Unforgettable Mental Model:** The **Security Guard's Shift**. The guard (try/catch) watches the door during their shift (synchronous execution). But the thief (async error) arrives after the guard's shift ends (after the function returns). The guard was there, just not at the right time.
- **The Trap:** Assuming that because Express catches sync throws, it also catches async errors. The timing difference is subtle but critical — sync throws happen during middleware execution, async rejections happen after.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express 4 uses synchronous try/catch around middleware execution, which catches sync throws but not rejected promises. The try/catch exits before the async operation completes, so when the promise rejects later, there's no error listener. This is a design limitation from before async/await was standard. Express 5 fixes this by detecting if a middleware returns a promise and attaching a .catch(next) handler automatically."

#### What is the asyncHandler wrapper pattern?
- **The Engine Mechanism (Why it behaves this way):** The asyncHandler is a higher-order function that takes an async route handler and returns a new function that Express can safely execute: `const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)`. `Promise.resolve()` ensures that even if `fn` throws synchronously, it's wrapped in a promise. `.catch(next)` attaches an error handler that passes any rejection to Express's error-handling middleware. Usage: `app.get('/users', asyncHandler(async (req, res) => { ... }))`.
- **The Unforgettable Mental Model:** The **Universal Adapter**. Your async handler is a plug with a different shape. The asyncHandler is the adapter that makes it fit into Express's socket, and it has a built-in surge protector (catch) to handle electrical faults (errors).
- **The Trap:** Forgetting `Promise.resolve()` — without it, synchronous throws in the handler won't be caught. Also, not passing all three arguments `(req, res, next)` to `fn`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The asyncHandler wrapper is a higher-order function that wraps async route handlers and catches any rejected promises. It uses Promise.resolve() to handle both sync throws and async rejections, and .catch(next) to pass errors to Express's error handler. I use it on every async route — it eliminates try/catch boilerplate and ensures consistent error handling. It's a one-liner that I keep in a utils file or import from express-async-handler."

#### How do you handle async errors in middleware (not routes)?
- **The Engine Mechanism (Why it behaves this way):** The same principles apply — async middleware must handle its own errors. Pattern: `const authMiddleware = async (req, res, next) => { try { const token = req.headers.authorization; const decoded = await verifyToken(token); req.user = decoded; next(); } catch (err) { next(err); } }`. Alternatively, wrap the middleware with asyncHandler: `app.use(asyncHandler(authMiddleware))`. The key is that every async code path must either call `next()` on success or `next(err)` on failure — never leave the promise unhandled.
- **The Unforgettable Mental Model:** The **Checkpoint with Two Gates**. Every async checkpoint has a green gate (next() for success) and a red gate (next(err) for failure). The traveler must go through one — they can't just stand in the middle.
- **The Trap:** Calling `next()` after `next(err)` — this passes control to both the error handler AND the next regular middleware, causing unpredictable behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Async middleware follows the same pattern as async routes — every code path must call next() or next(err). I use try/catch with next(err) in the catch block, or wrap the middleware with asyncHandler. The critical rule is that after calling next(err), you must not call next() — the error handler takes over. I also avoid doing heavy async work in middleware when possible, keeping middleware focused and fast."

#### What changes in Express 5 for async error handling?
- **The Engine Mechanism (Why it behaves this way):** Express 5 automatically detects if a middleware or route handler returns a Promise. If it does, Express attaches `.catch(next)` to the promise, so rejected promises are automatically passed to error-handling middleware. This eliminates the need for try/catch wrappers or asyncHandler utilities. The change is backward compatible — existing try/catch patterns still work, but they become optional for async code. Express 5 also improves route parameter handling and removes some deprecated APIs.
- **The Unforgettable Mental Model:** The **Auto-Deploy Parachute**. In Express 4, you had to manually pull the ripcord (try/catch). In Express 5, the parachute deploys automatically when you fall (rejected promise).
- **The Trap:** Assuming Express 5 is production-ready. As of 2024, Express 5 is still in beta/RC. Don't use it in production without thorough testing. The async error handling is the most anticipated feature.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express 5 will automatically catch rejected promises from async handlers and pass them to error-handling middleware, eliminating the need for asyncHandler wrappers. It detects if a handler returns a Promise and attaches .catch(next) automatically. This is backward compatible — existing try/catch patterns still work. However, Express 5 is still in RC, so I wouldn't use it in production yet. For now, the asyncHandler wrapper remains essential."

## 8. Active recall test

1. **Why do async errors crash Express 4 applications?**
   - **Explanation:** Express 4 uses synchronous try/catch around middleware execution. Async rejections happen after the try/catch exits, so they're unhandled and crash the Node process as unhandled promise rejections.

2. **What does the asyncHandler wrapper do?**
   - **Explanation:** It wraps an async function, calls it with (req, res, next), wraps the result in Promise.resolve(), and attaches .catch(next) to pass any rejection to Express's error handler.

3. **How do you handle errors in async middleware?**
   - **Explanation:** Wrap async operations in try/catch and call next(err) in the catch block, or wrap the entire middleware with asyncHandler. Every code path must call either next() or next(err).

4. **What is the risk of calling next() after next(err)?**
   - **Explanation:** It passes control to both the error handler and the next regular middleware, causing unpredictable behavior — the error handler may send a response while another middleware tries to modify it.

5. **Will Express 5 fix async error handling?**
   - **Explanation:** Yes. Express 5 detects if a handler returns a Promise and automatically attaches .catch(next), so rejected promises are passed to error handlers without manual try/catch or wrappers.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle async errors in Express in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle async errors in Express in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
