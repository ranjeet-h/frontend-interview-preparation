# How do you define routes

## Detailed explanation

How do you define routes is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you define routes by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you define routes affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you define routes in Express?
- **The Engine Mechanism (Why it behaves this way):** Routes are defined using HTTP method functions on the Express app or router instance: `app.get(path, handler)`, `app.post(path, handler)`, `app.put()`, `app.delete()`, `app.patch()`, etc. Each route takes a path string (with optional parameters like `:id` or wildcards like `*`) and one or more handler functions. Handlers receive `(req, res, next)`. Express matches routes in registration order using path-to-regexp, which converts path strings into regular expressions. Route parameters are parsed and placed on `req.params`, query strings on `req.query`.
- **The Unforgettable Mental Model:** The **Mail Sorting Machine**. Each route is a slot labeled with a specific address pattern. When mail (request) arrives, the machine reads the address (URL + method) and drops it into the matching slot (handler). `:id` is like a wildcard slot that accepts any number.
- **The Trap:** Defining routes with overlapping patterns where a more specific route is shadowed by a more general one registered earlier. For example, `app.get('/users/:id')` before `app.get('/users/new')` — the `:id` parameter will match the literal string "new".
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Express routes are defined using HTTP method functions like app.get(), app.post(), app.put(), and app.delete(). Each route takes a path pattern and a handler function. Path parameters use colon syntax like /users/:id, and query strings are available on req.query. Routes are matched in registration order using path-to-regexp, so more specific routes should be registered before parameterized ones to avoid shadowing."

#### What are route parameters and how do you access them?
- **The Engine Mechanism (Why it behaves this way):** Route parameters are defined with a colon prefix in the path string: `/users/:userId/posts/:postId`. When a request matches, Express extracts the values from the URL segments and places them on `req.params` as an object: `{ userId: '123', postId: '456' }`. Parameters are always strings — even if the URL contains numbers. You can make parameters optional with `?`: `/users/:id?`. Multiple parameters can be captured with `*` or regex patterns.
- **The Unforgettable Mental Model:** The **Fill-in-the-Blank Form**. The route path is a form with blank spaces (`/users/___/posts/___`). Whatever the user writes in those blanks becomes the values on req.params.
- **The Trap:** Assuming route parameters are typed. `req.params.id` is always a string, even if the URL is `/users/42`. You must explicitly convert: `parseInt(req.params.id)`. Also, not validating that the parameter is a valid ID format before querying the database.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Route parameters are defined with colon syntax in the path — /users/:id. Express extracts the values and places them on req.params as strings. Even numeric IDs come as strings, so you need to parse them. I always validate parameter formats before using them in database queries to prevent injection attacks and handle malformed input gracefully."

#### How do you handle query parameters in Express routes?
- **The Engine Mechanism (Why it behaves this way):** Query parameters are the key-value pairs after the `?` in a URL: `/search?q=express&limit=10&page=2`. Express automatically parses the query string and places the result on `req.query` as an object: `{ q: 'express', limit: '10', page: '2' }`. Like route parameters, all values are strings. Arrays are supported via repeated keys: `/tags?name=js&name=node` becomes `{ name: ['js', 'node'] }`. The query string parser can be customized via the `query parser` app setting.
- **The Unforgettable Mental Model:** The **Order Customization Card**. The main order is the route path (the dish), but the query string is the customization card — extra sauce, no onions, size large. Each key-value pair modifies how the main request is processed.
- **The Trap:** Treating query parameter values as their expected types without conversion. `req.query.limit` is `"10"` (string), not `10` (number). Also, not sanitizing query parameters before using them in database queries.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Query parameters are automatically parsed by Express and available on req.query as an object. All values are strings, so numeric parameters like limit or page need explicit conversion. I always validate and sanitize query parameters before using them, especially for pagination, filtering, and search — they're user-controlled input and shouldn't be trusted."

#### Can you chain multiple handlers on a single route?
- **The Engine Mechanism (Why it behaves this way):** Yes — Express route methods accept multiple handler functions: `app.get('/users', authMiddleware, validateParams, getUsersHandler)`. Each handler runs in sequence, and each must call `next()` to pass control to the next handler. If any handler sends a response or calls `next(err)`, the chain stops. This pattern is commonly used for route-level middleware — authentication, validation, rate limiting — before the main handler executes.
- **The Unforgettable Mental Model:** The **Assembly Line Station**. A single product (request) passes through multiple workers at one station — inspector (auth), measurer (validation), assembler (handler). Each worker must approve before the next can work.
- **The Trap:** Forgetting that each handler in the chain must call `next()`. If the second handler doesn't call `next()`, the third handler never runs. Also, error handling in chained handlers requires `next(err)`, not `throw`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Yes, Express routes accept multiple handler functions that execute in sequence. I use this pattern extensively for route-level middleware — authentication, validation, and authorization handlers run before the main business logic handler. Each handler calls next() to pass control forward, or sends a response/next(err) to stop the chain. This keeps route handlers focused and reusable."

#### What is the difference between route-level and application-level middleware?
- **The Engine Mechanism (Why it behaves this way):** Application-level middleware is registered with `app.use()` and runs for every request (or every request matching a path prefix). Route-level middleware is registered directly on a route definition and only runs for that specific route. Both use the same `(req, res, next)` signature and execute in the same middleware stack. The key difference is scope: application middleware is global, route middleware is local. Route-level middleware is ideal for per-route concerns like specific validation rules or role checks.
- **The Unforgettable Mental Model:** **Building Security vs. Room Security**. Application middleware is the building's front door security — everyone passes through it. Route middleware is a specific room's keycard reader — only people entering that room need it.
- **The Trap:** Duplicating application-level middleware logic as route-level middleware, or vice versa. Auth should typically be application-level (with exceptions), while validation is often route-level.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Application-level middleware with app.use() runs for all requests and handles cross-cutting concerns like logging, CORS, and body parsing. Route-level middleware is attached to specific routes and handles route-specific concerns like validation or role checks. Both use the same middleware signature and run in the same stack. I use application middleware for global concerns and route middleware for per-endpoint logic."

## 8. Active recall test

1. **How do you define a GET route in Express?**
   - **Explanation:** Use `app.get('/path', handler)` where handler is a function `(req, res, next)`. Similar methods exist for POST, PUT, DELETE, PATCH, etc.

2. **How do you extract a URL parameter like /users/42?**
   - **Explanation:** Define the route as `/users/:id` and access the value via `req.params.id`. Note that it's always a string, so parse it if needed.

3. **Where are query string parameters stored?**
   - **Explanation:** On `req.query` as an object. For `/search?q=test&limit=10`, `req.query` is `{ q: 'test', limit: '10' }`. All values are strings.

4. **Can a route have multiple handler functions?**
   - **Explanation:** Yes. `app.get('/path', middleware1, middleware2, handler)` runs each function in sequence. Each must call `next()` to pass control to the next.

5. **What happens if a more general route is registered before a specific one?**
   - **Explanation:** The general route shadows the specific one. For example, `/users/:id` before `/users/new` means `/users/new` matches `:id` with value "new", not the specific route.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you define routes in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you define routes in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
