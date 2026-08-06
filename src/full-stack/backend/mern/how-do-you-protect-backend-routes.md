# How do you protect backend routes

## Detailed explanation

How do you protect backend routes is a full-stack integration topic that checks whether frontend and backend contracts work together safely. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

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

In a production full-stack app, how do you protect backend routes affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you protect backend routes in a MERN app?
- **The Engine Mechanism (Why it behaves this way):** Apply authentication middleware to protected routes: `app.get('/api/profile', authenticate, getProfile)`. The authenticate middleware extracts the JWT from the Authorization header, verifies it with `jwt.verify()`, and attaches the decoded payload to `req.user`. If verification fails, it returns 401. For role-based protection, chain authorization middleware: `app.delete('/api/users/:id', authenticate, authorize('admin'), deleteUser)`. Public routes (login, register) don't have auth middleware. Apply global auth middleware to route groups: `router.use(authenticate)` protects all routes in that router.
- **The Unforgettable Mental Model:** The **Checkpoint System**. Each protected route has a checkpoint (auth middleware) that verifies your ID (JWT) before letting you through. Some checkpoints also check your clearance level (role middleware). Public routes have no checkpoints.
- **The Trap:** Forgetting to protect a route — a single unprotected route that should be protected is a security vulnerability. Audit all routes systematically.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I protect backend routes with authentication middleware that verifies JWT tokens from the Authorization header. If valid, req.user is set and the request proceeds. If invalid, 401 is returned. For role-based protection, I chain authorization middleware after authentication. I apply auth middleware at the router level for groups of protected routes. Public routes like login and register don't have auth middleware. I audit all routes to ensure none are accidentally unprotected."

#### How do you implement the authentication middleware?
- **The Engine Mechanism (Why it behaves this way):** `const authenticate = async (req, res, next) => { try { const authHeader = req.headers.authorization; if (!authHeader?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' }); const token = authHeader.split(' ')[1]; const decoded = jwt.verify(token, process.env.JWT_SECRET); const user = await User.findById(decoded.id).select('-password'); if (!user) return res.status(401).json({ error: 'User not found' }); req.user = user; next(); } catch (err) { if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' }); return res.status(401).json({ error: 'Invalid token' }); } };`. The middleware verifies the token, fetches the user from the database (to catch deleted users), and attaches it to req.user.
- **The Unforgettable Mental Model:** The **ID Verification**. The guard (middleware) checks your ID card (JWT), verifies it's not expired, cross-references it with the employee database (User.findById), and if everything checks out, gives you a visitor badge (req.user).
- **The Trap:** Only verifying the JWT without checking if the user still exists in the database. A deleted user's token would still be valid until expiration.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The auth middleware extracts the Bearer token, verifies it with jwt.verify, and fetches the user from the database. Fetching the user is important — it catches deleted users whose tokens would otherwise still be valid. I attach the user to req.user and call next(). For error handling, I distinguish between TokenExpiredError (so the frontend knows to refresh) and other errors. I also exclude the password field when fetching the user."

#### How do you implement role-based authorization middleware?
- **The Engine Mechanism (Why it behaves this way):** Create a factory function: `const authorize = (...allowedRoles) => (req, res, next) => { if (!req.user) return res.status(401).json({ error: 'Authentication required' }); if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ error: 'Insufficient permissions' }); next(); };`. Usage: `app.delete('/api/users/:id', authenticate, authorize('admin'), deleteUser)`. The authenticate middleware must run first to set req.user. The authorize middleware checks if req.user.role is in the allowed roles list. For hierarchical roles, compare role levels instead of exact matches.
- **The Unforgettable Mental Model:** The **Clearance Check**. After verifying your ID (authentication), the guard checks your clearance level (role). If your clearance matches the required level, you enter. If not, you're denied with a 403.
- **The Trap:** Using authorize without authenticate first — req.user won't be set, causing the authorization to fail. Always chain authenticate before authorize.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create an authorize factory function that accepts allowed roles and returns middleware. It checks if req.user.role is in the allowed list. If not, it returns 403. The key is that authenticate must run first to set req.user. I always chain them: authenticate, then authorize, then the handler. For hierarchical roles, I compare numeric role levels instead of exact matches so higher roles inherit lower permissions."

#### How do you protect entire route groups?
- **The Engine Mechanism (Why it behaves this way):** Apply auth middleware at the router level: `const router = express.Router(); router.use(authenticate); router.get('/profile', getProfile); router.put('/profile', updateProfile); app.use('/api/users', router);`. All routes in the router require authentication. For mixed access (some public, some protected), apply auth middleware to specific routes: `router.get('/public', publicHandler); router.use(authenticate); router.get('/protected', protectedHandler);`. Routes registered before `router.use(authenticate)` are public; routes after are protected.
- **The Unforgettable Mental Model:** The **Building Wing**. Instead of checking IDs at every room (route), you check at the wing entrance (router.use). Everyone in that wing is verified. If a wing has a public lobby and private offices, you place the checkpoint between them.
- **The Trap:** Applying router.use(authenticate) before public routes — it protects everything, including routes that should be public. Order matters within the router.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I apply auth middleware at the router level with router.use(authenticate) to protect all routes in that router. For mixed access, I register public routes before router.use(authenticate) and protected routes after. This keeps the code clean — I don't need to add authenticate to every individual route. I organize routers by domain (users, products, orders) and apply auth at the appropriate level for each."

#### How do you test protected backend routes?
- **The Engine Mechanism (Why it behaves this way):** Test three scenarios: (1) **No token** — request without Authorization header, expect 401. (2) **Invalid token** — request with fake token, expect 401. (3) **Valid token** — mock jwt.verify to return a user payload, set Authorization header, expect 200. For authorization: test with different roles — admin should get 200, regular user should get 403. Use supertest: `await request(app).get('/api/profile').set('Authorization', 'Bearer valid-token').expect(200)`. Mock jwt.verify: `jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'user1', role: 'admin' })`.
- **The Unforgettable Mental Model:** The **Three-Key Test**. Test with no key (401), wrong key (401), and right key (200). Then test with the right key but wrong clearance (403 for authorization).
- **The Trap:** Using real JWT tokens in tests — they expire and require a real secret. Mock jwt.verify() for reliable, fast tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test protected routes with three scenarios: no token (401), invalid token (401), and valid token (200). I mock jwt.verify() to return controlled user payloads. For authorization, I test with different roles — admin gets 200, regular user gets 403. I use supertest with set('Authorization', 'Bearer token') to simulate authenticated requests. Auth tests are critical because bugs here mean data leaks."

## 8. Active recall test

1. **How do you protect a single route in Express?**
   - **Explanation:** Chain auth middleware before the handler: `app.get('/profile', authenticate, getProfile)`. The middleware verifies the JWT and sets req.user before the handler runs.

2. **Why fetch the user from the database in auth middleware?**
   - **Explanation:** To catch deleted users. A JWT for a deleted user would still be valid until expiration. Database lookup ensures the user still exists.

3. **How do you implement role-based authorization?**
   - **Explanation:** Factory function: `const authorize = (...roles) => (req, res, next) => { if (!roles.includes(req.user.role)) return res.status(403).json(...); next(); }`. Chain after authenticate.

4. **How do you protect an entire router?**
   - **Explanation:** `router.use(authenticate)` applies auth middleware to all routes in the router. Register public routes before router.use and protected routes after.

5. **How do you test protected routes?**
   - **Explanation:** Test no token (401), invalid token (401), valid token (200). Mock jwt.verify() for controlled payloads. For authorization, test different roles.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you protect backend routes in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you protect backend routes in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
