# How do you test APIs

## Detailed explanation

How do you test APIs is a core backend testing topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you test apis by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply backend testing rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you test apis affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you test APIs?
- **The Engine Mechanism (Why it behaves this way):** API testing involves sending HTTP requests to your endpoints and asserting on the response status code, headers, body, and side effects. You test at multiple levels: unit tests for handler logic (mocking services), integration tests with a real database and test HTTP client (Supertest for Express, TestClient for FastAPI), and E2E tests against a deployed environment. Each level verifies different concerns: logic correctness, data flow, and full system behavior.
- **The Unforgettable Mental Model:** The **Restaurant Quality Check**. You taste the ingredients (unit test), verify the dish is plated correctly with all components (integration test), and then have a customer eat the full meal in the dining room (E2E test).
- **The Trap:** Only testing the happy path (200 responses). API tests must cover 400 (bad request), 401 (unauthorized), 403 (forbidden), 404 (not found), and 500 (server error) responses.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test APIs at three levels. Unit tests verify handler logic with mocked services. Integration tests use a real database and test HTTP client to verify data flow and response shapes. E2E tests run against a deployed environment to verify the full system. I test all response codes — not just 200, but also 400, 401, 403, 404, and 500 — and verify side effects like database changes and email sends."

#### Why does API testing matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** APIs are the interface between your backend and the outside world — frontend clients, mobile apps, third-party integrations, and other services. API testing ensures this interface is correct, secure, and reliable. It catches routing errors, serialization bugs, authentication gaps, validation failures, and performance issues before they affect consumers.
- **The Unforgettable Mental Model:** The **Storefront Window**. The API is how customers see and interact with your business. If the window display is wrong, customers leave — even if the warehouse (backend logic) is perfectly organized.
- **The Trap:** Assuming internal correctness means external correctness. Your service layer might work perfectly, but if the API route maps to the wrong handler or returns the wrong status code, consumers break.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: APIs are the interface between our backend and consumers — frontend, mobile, third-party services. API testing ensures this interface is correct, secure, and reliable. It catches routing errors, serialization bugs, auth gaps, and validation failures. Internal correctness doesn't guarantee external correctness — the service layer might work, but if the API returns the wrong status code, consumers break."

#### What is a simple API test implementation?
- **The Engine Mechanism (Why it behaves this way):** A basic API test starts a test server, sends an HTTP request, and asserts on the response. In Express with Supertest: `request(app).get('/users').expect(200).then(res => expect(res.body).toHaveLength(3))`. In FastAPI with TestClient: `response = client.get('/users'); assert response.status_code == 200`. The test should verify status code, response body shape, headers (Content-Type, CORS), and side effects (database state).
- **The Unforgettable Mental Model:** The **Mail Test**. You send a letter (request) to an address (endpoint), and verify the reply (response) arrives with the correct content, stamp (status code), and return address (headers).
- **The Trap:** Not cleaning up test data. Each test should use a fresh database state or roll back transactions to avoid interfering with other tests.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A basic API test starts a test server, sends an HTTP request, and asserts on status code, response body, headers, and side effects. I use Supertest for Express or TestClient for FastAPI. Each test runs in a transaction that rolls back afterward, ensuring clean state. I verify not just the happy path but also error responses, pagination, filtering, and authentication requirements."

#### What edge cases can break API tests?
- **The Engine Mechanism (Why it behaves this way):** Common edge cases include: malformed JSON bodies, missing required fields, oversized payloads, invalid query parameters, concurrent requests causing race conditions, pagination edge cases (empty pages, last page), authentication token expiration during a request, and CORS preflight failures. API tests should also verify behavior with special characters, Unicode, and SQL injection attempts.
- **The Unforgettable Mental Model:** The **Stress Interview**. You don't just ask the candidate easy questions. You ask trick questions, interrupt them, give them impossible scenarios, and see how they handle pressure. That's what edge case testing does to your API.
- **The Trap:** Assuming the frontend will always send valid data. APIs must defend against malformed, missing, or malicious input — the frontend is not a security boundary.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test edge cases like malformed JSON, missing fields, oversized payloads, invalid query params, race conditions, and pagination boundaries. I also test with special characters, Unicode, and injection attempts. The key principle: the frontend is not a security boundary. APIs must validate and sanitize all input, regardless of what the frontend sends."

#### How do API tests affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** API tests verify the contract that frontend clients depend on. When API tests pass, the frontend can trust that endpoints return the expected data shapes, status codes, and error formats. API tests should verify the exact response structure the frontend consumes — including nested objects, arrays, null values, and error message formats. Changes to the API that break frontend expectations should fail the API tests.
- **The Unforgettable Mental Model:** The **Power Outlet Standard**. The frontend plugs into the API outlet. If the outlet changes voltage (data shape) or plug type (endpoint structure), the frontend appliance stops working. API tests verify the standard stays consistent.
- **The Trap:** Changing API responses without updating tests or frontend. Even "improvements" like renaming fields or changing null to empty arrays can break the frontend.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: API tests protect frontend clients by verifying the exact response structure they consume — data shapes, status codes, error formats, null handling. I write API tests from the frontend's perspective: what does the frontend need, and does the API deliver it? When I change the API, the tests catch breaking changes before they reach the frontend team."

#### What would you monitor in production for API health?
- **The Engine Mechanism (Why it behaves this way):** Key metrics include: response latency (p50, p95, p99), error rate (4xx and 5xx percentages), throughput (requests per second), endpoint-specific error rates, authentication failure rates, and payload size distributions. You should also monitor API version usage (to plan deprecations), rate limit hits, and slow query logs. Alerting should trigger on error rate spikes, latency increases, and throughput drops.
- **The Unforgettable Mental Model:** The **Vital Signs Monitor**. Just as a hospital monitors heart rate, blood pressure, oxygen levels, and temperature, you monitor API latency, error rate, throughput, and payload size. Any abnormal reading signals a problem.
- **The Trap:** Only monitoring average latency. The p99 latency (slowest 1% of requests) is where users feel pain. Averages hide outliers.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor response latency at p50, p95, and p99 percentiles — not just averages, because p99 is where users feel pain. I track error rates by endpoint and status code, throughput, authentication failures, and rate limit hits. I also monitor API version usage for deprecation planning. Alerts trigger on error rate spikes, latency increases, and throughput drops."

## 8. Active recall test

1. **What are the three levels of API testing?**
   - **Explanation:** Unit tests (handler logic with mocked services), integration tests (real database with test HTTP client), and E2E tests (deployed environment, full system behavior).

2. **What should an API test verify?**
   - **Explanation:** Status code, response body shape, headers (Content-Type, CORS), and side effects (database changes, emails sent). Not just 200 responses but also 400, 401, 403, 404, and 500.

3. **What tools help with API testing?**
   - **Explanation:** Supertest for Express.js, TestClient for FastAPI, Postman/Newman for collection testing, and REST Assured for Java. All provide HTTP client utilities for sending requests and asserting responses.

4. **What edge cases should API tests cover?**
   - **Explanation:** Malformed JSON, missing fields, oversized payloads, invalid query params, race conditions, pagination boundaries, special characters, Unicode, and injection attempts.

5. **How do API tests protect frontend clients?**
   - **Explanation:** They verify the exact response structure the frontend consumes — data shapes, status codes, error formats, null handling. Breaking changes fail the tests before reaching the frontend.

6. **Why test error responses, not just happy paths?**
   - **Explanation:** APIs must handle invalid input gracefully. Error responses (400, 401, 403, 404, 500) are how the API communicates problems to consumers. If error responses are wrong, consumers can't handle failures.

7. **What production metrics indicate API health?**
   - **Explanation:** Response latency (p50, p95, p99), error rate by endpoint and status code, throughput, authentication failures, rate limit hits, and API version usage. Alert on spikes and drops.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you test APIs in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you test APIs in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
