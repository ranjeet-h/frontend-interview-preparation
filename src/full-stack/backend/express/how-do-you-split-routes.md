# How do you split routes

## Detailed explanation

How do you split routes is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you split routes by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you split routes affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you split routes in Express?
- **The Engine Mechanism (Why it behaves this way):** Express provides `express.Router()` to create modular, mountable route handlers. A Router is a mini Express application that has its own middleware stack, routes, and parameters. You define routes on a Router instance and then mount it on the main app with `app.use('/api/users', userRouter)`. All routes defined on the Router are prefixed with the mount path. Routers can be nested — a Router can mount another Router. This enables clean separation of concerns by domain (users, products, orders).
- **The Unforgettable Mental Model:** The **Department System**. The main app is the company headquarters. Each Router is a department (HR, Engineering, Sales) with its own internal processes. The headquarters routes visitors to the right department, and each department handles its own business independently.
- **The Trap:** Creating too many small Routers (one per file for simple apps) or too few giant Routers (everything in one file). The sweet spot is one Router per domain entity or feature area.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use express.Router() to create modular route handlers. Each domain entity gets its own Router — users, products, orders — defined in separate files. The Router is mounted on the main app with a path prefix like app.use('/api/users', userRouter). This keeps the codebase organized, enables team parallelism, and makes testing easier since each Router can be tested in isolation."

#### What is express.Router() and how does it work?
- **The Engine Mechanism (Why it behaves this way):** `express.Router()` creates an isolated middleware and routing layer. It supports all the same methods as the main app: `router.get()`, `router.post()`, `router.use()`, `router.param()`, etc. When mounted with `app.use('/prefix', router)`, Express merges the router's middleware stack into the main app's stack at that point. The router's routes are prefixed with the mount path. Routers can have their own middleware that only applies to routes within that router. You can also create routers with options: `express.Router({ mergeParams: true })` preserves parent route parameters.
- **The Unforgettable Mental Model:** The **Sub-Assembly Line**. The main factory line (app) has a station where a sub-assembly line (router) takes over. The sub-line has its own workers and processes, but everything that comes out is still part of the main product.
- **The Trap:** Forgetting `mergeParams: true` when nesting routers with parameters. Without it, child routers can't access parent route parameters like `req.params.parentId`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: express.Router() creates a modular route handler with its own middleware stack. I define routes on it just like the main app, then mount it with app.use('/prefix', router). Each router can have its own middleware, making it self-contained. When nesting routers, I use mergeParams: true so child routers can access parent parameters. This pattern scales well — each router file is a focused module for a specific domain."

#### How do you organize routes across multiple files?
- **The Engine Mechanism (Why it behaves this way):** The standard pattern is: (1) Create a `routes/` directory. (2) Each file exports a Router: `module.exports = router`. (3) In `app.js` or `server.js`, import and mount each router: `app.use('/api/users', require('./routes/users'))`. (4) Within each route file, define all CRUD operations for that entity. For larger apps, add subdirectories: `routes/admin/`, `routes/public/`. Some teams use an `index.js` in the routes directory that imports and re-exports all routers for centralized mounting.
- **The Unforgettable Mental Model:** The **Filing Cabinet**. Each drawer (file) contains documents for one topic. The cabinet label (mount path) tells you which drawer to open. You don't mix tax documents with medical records.
- **The Trap:** Circular dependencies between route files and the main app. Keep routers self-contained — they should import services/controllers, not the app instance.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create a routes/ directory with one file per domain entity. Each file exports an express.Router with all CRUD routes for that entity. The main app imports and mounts each router with a path prefix. For larger apps, I group by feature area — routes/admin/, routes/public/. Routers stay self-contained, importing services rather than the app instance, which avoids circular dependencies and makes testing easier."

#### What is the benefit of route splitting for testing?
- **The Engine Mechanism (Why it behaves this way):** When routes are split into separate Router modules, each router can be tested in isolation without starting the full Express app. You can use `supertest` with just the router: `request(router).get('/users').expect(200)`. This enables faster, more focused unit tests. Each router's middleware chain is self-contained, so you can mock dependencies (database, auth) per router. Integration tests can still test the full app, but unit tests target individual routers.
- **The Unforgettable Mental Model:** The **Car Component Testing**. You don't need to test the entire car to verify the brakes work. You can test the brake system independently, then test the full car for integration.
- **The Trap:** Over-isolating tests to the point where you miss integration issues between routers. Always have both unit tests (per router) and integration tests (full app).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Split routes into separate Router modules so each can be tested independently. I use supertest to test routers without starting the full app, which makes tests faster and more focused. Each router's dependencies can be mocked individually. I combine this with integration tests that test the full mounted app to catch cross-router issues. The result is a test pyramid — many fast unit tests per router, fewer slower integration tests."

#### How do you handle shared middleware across split routes?
- **The Engine Mechanism (Why it behaves this way):** Shared middleware can be applied at three levels: (1) **Application level** — `app.use(authMiddleware)` applies to all routes, including mounted routers. (2) **Router level** — `router.use(authMiddleware)` applies to all routes within that router. (3) **Route level** — `router.get('/path', authMiddleware, handler)` applies to a single route. The common pattern is to apply global middleware (CORS, body parsing, logging) at the app level, domain-specific middleware (auth, role checks) at the router level, and route-specific middleware (validation, ownership checks) at the route level.
- **The Unforgettable Mental Model:** The **Layered Security**. Airport security (app-level) checks everyone. Terminal security (router-level) checks people entering a specific terminal. Gate security (route-level) checks people boarding a specific flight.
- **The Trap:** Applying the same middleware at multiple levels, causing duplicate processing. For example, applying auth at both app level and router level means auth runs twice for mounted router routes.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I apply middleware at the appropriate scope. Global concerns like CORS and body parsing go on the app. Domain-specific middleware like auth goes on the router. Route-specific checks like validation go on individual routes. This layered approach avoids duplication and makes it clear which middleware applies where. I also extract shared middleware into a middleware/ directory so it can be reused across routers."

## 8. Active recall test

1. **What does express.Router() create?**
   - **Explanation:** A modular, mountable route handler with its own middleware stack, routes, and parameter handling. It's a mini Express application that can be mounted on the main app with a path prefix.

2. **How do you mount a router on the main app?**
   - **Explanation:** `app.use('/api/users', userRouter)` — all routes defined on userRouter will be prefixed with `/api/users`.

3. **What does mergeParams: true do?**
   - **Explanation:** It preserves parent route parameters in nested routers. Without it, a child router cannot access parameters defined in the parent router's mount path.

4. **What is the recommended file organization for routes?**
   - **Explanation:** A `routes/` directory with one file per domain entity, each exporting a Router. The main app imports and mounts each router. For larger apps, subdirectories group by feature area.

5. **Why is route splitting beneficial for testing?**
   - **Explanation:** Each Router can be tested in isolation with supertest without starting the full app. Dependencies can be mocked per router, enabling faster, more focused unit tests alongside integration tests.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you split routes in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you split routes in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
