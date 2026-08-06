# How do you test Express APIs

## Detailed explanation

How do you test Express APIs is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you test express apis by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you test express apis affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you test Express APIs?
- **The Engine Mechanism (Why it behaves this way):** Use `supertest` for HTTP-level testing and `jest` or `mocha` as the test runner. Supertest wraps your Express app and makes HTTP requests without starting a real server: `const request = require('supertest'); const app = require('../app'); describe('GET /users', () => { it('returns users', async () => { const res = await request(app).get('/users').expect(200); expect(res.body).toHaveLength(2); }); });`. Mock database calls with `jest.mock()` or use an in-memory database (mongodb-memory-server). Test happy paths, error paths, auth failures, and validation errors.
- **The Unforgettable Mental Model:** The **Test Kitchen**. Instead of serving customers (real users), you cook test meals (test requests) in a controlled kitchen (test environment) to verify the recipes (routes) work correctly before opening the restaurant (production).
- **The Trap:** Starting a real HTTP server for tests — this is slow and causes port conflicts. Supertest tests the Express app directly without a server.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use supertest for HTTP-level API testing and jest as the test runner. Supertest makes requests against the Express app directly without starting a server, which is fast and reliable. I mock database calls with jest.mock() or use mongodb-memory-server for integration tests. I test happy paths, error paths, authentication failures, and validation errors. Each test is isolated — I clean the database before each test to ensure no cross-test contamination."

#### What's the difference between unit tests and integration tests for Express?
- **The Engine Mechanism (Why it behaves this way):** Unit tests test individual functions in isolation: services, middleware, utility functions. They mock all dependencies (database, external APIs). Integration tests test the full request-response cycle: supertest makes HTTP requests to the Express app, which runs through middleware, routes, and database (real or in-memory). Unit tests are fast and pinpoint failures. Integration tests catch issues between components. Test pyramid: many unit tests, fewer integration tests, even fewer end-to-end tests.
- **The Unforgettable Mental Model:** **Component Testing vs. Assembly Testing**. Unit tests check each car part individually (engine, brakes, steering). Integration tests check how the parts work together when assembled. Both are needed — a perfect engine means nothing if it doesn't connect to the transmission.
- **The Trap:** Writing only integration tests — they're slower and harder to debug when they fail. Or writing only unit tests — you miss integration issues between components.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Unit tests test individual functions — services, middleware, utilities — with mocked dependencies. They're fast and pinpoint failures. Integration tests test the full request-response cycle with supertest, using a real or in-memory database. They catch issues between components. I follow the test pyramid: many fast unit tests, fewer integration tests, and minimal end-to-end tests. Both are essential — unit tests for speed and precision, integration tests for confidence."

#### How do you mock database calls in tests?
- **The Engine Mechanism (Why it behaves this way):** Two approaches: (1) **Jest mocks** — `jest.spyOn(User, 'find').mockResolvedValue([{ id: 1, name: 'Alice' }])`. This replaces the real database call with a mock response. (2) **In-memory database** — `mongodb-memory-server` provides a real MongoDB instance in memory. Tests run against the actual database, catching schema and query issues that mocks miss. Jest mocks are faster but can diverge from real behavior. In-memory DB is slower but more realistic. Use mocks for unit tests, in-memory DB for integration tests.
- **The Unforgettable Mental Model:** **Stunt Double vs. Real Actor**. Mocks are stunt doubles — they perform the action safely and quickly but aren't the real thing. In-memory DB is the real actor — slower to set up but gives you the authentic performance.
- **The Trap:** Over-mocking — mocking so much that tests pass but the real code fails. Mocks should replace external dependencies, not the core logic being tested.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For unit tests, I use jest mocks to replace database calls with controlled responses. For integration tests, I use mongodb-memory-server for a real in-memory database. Mocks are fast but can diverge from real behavior. In-memory DB is slower but catches real query and schema issues. I use mocks when testing business logic in services, and in-memory DB when testing the full API endpoint behavior."

#### How do you test authentication and authorization?
- **The Engine Mechanism (Why it behaves this way):** Test three scenarios per protected route: (1) **No token** — should return 401: `await request(app).get('/profile').expect(401)`. (2) **Invalid token** — should return 401: `await request(app).get('/profile').set('Authorization', 'Bearer invalid').expect(401)`. (3) **Valid token** — should return 200: mock jwt.verify to return a user payload, then `await request(app).get('/profile').set('Authorization', 'Bearer valid').expect(200)`. For authorization, test with different roles: mock user as 'admin' (should pass) and 'user' (should get 403).
- **The Unforgettable Mental Model:** The **Three-Key Test**. Test with no key (401), wrong key (401), and right key (200). Then test with the right key but wrong clearance level (403 for authorization).
- **The Trap:** Using real JWT tokens in tests — they expire and require a real secret. Mock jwt.verify() instead for reliable, fast tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test auth with three scenarios: no token (401), invalid token (401), and valid token (200). I mock jwt.verify() to return controlled user payloads instead of using real tokens. For authorization, I test with different roles — admin should access everything, regular users should get 403 for restricted routes. I also test edge cases like expired tokens and revoked refresh tokens. Auth tests are critical because bugs here mean data leaks."

#### How do you test error handling?
- **The Engine Mechanism (Why it behaves this way):** Test error scenarios: (1) **Validation errors** — send invalid data, expect 400 with error details. (2) **Not found** — request non-existent resource, expect 404. (3) **Server errors** — mock database to throw, expect 500 with generic message. (4) **Async errors** — ensure async route handlers properly catch and pass errors. Verify error responses don't leak stack traces: `expect(res.body).not.toHaveProperty('stack')`. Test that the error handler logs errors (mock the logger): `expect(logger.error).toHaveBeenCalledWith(...)`.
- **The Unforgettable Mental Model:** The **Stress Test**. You don't just test if the bridge holds under normal traffic — you test if it handles earthquakes (server errors), floods (validation errors), and missing supports (not found).
- **The Trap:** Only testing happy paths. Error handling is where most production bugs occur. Test every error scenario as thoroughly as success scenarios.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test error handling as thoroughly as happy paths. I test validation errors (400), not found (404), server errors (500), and async error propagation. I verify error responses don't leak stack traces or internal details. I mock the logger to verify errors are logged correctly. I also test that async errors are properly caught and passed to the error handler. Error handling tests are critical because that's where most production bugs hide."

## 8. Active recall test

1. **What library is used for HTTP testing in Express?**
   - **Explanation:** `supertest` — it makes HTTP requests against the Express app directly without starting a real server, enabling fast and reliable API tests.

2. **What's the difference between unit and integration tests?**
   - **Explanation:** Unit tests test individual functions with mocked dependencies (fast, pinpoint failures). Integration tests test the full request-response cycle with real or in-memory databases (catches component interaction issues).

3. **How do you mock jwt.verify() in tests?**
   - **Explanation:** `jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'user1', role: 'admin' })`. This returns a controlled payload without needing real tokens or secrets.

4. **What should you verify in error response tests?**
   - **Explanation:** Correct status code, error message format, and that no sensitive data (stack traces, file paths, internal details) is exposed to the client.

5. **Why use mongodb-memory-server for integration tests?**
   - **Explanation:** It provides a real MongoDB instance in memory, catching schema and query issues that mocks miss. Slower than mocks but more realistic and reliable.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you test Express APIs in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you test Express APIs in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
