# HTTP Status Codes

## Detailed explanation

Status codes are the backend response vocabulary that tells clients whether a request succeeded, failed because of the client, failed because of the server, or needs another action.

## 1. One-line mental model

Use status codes to make API results machine-readable and predictable.

## 2. Problem it solves

Without status code discipline, clients parse random messages and cannot reliably handle auth, validation, retries, or not-found states.

## 3. Core idea

- 2xx means success, such as 200, 201, 204.
- 3xx means redirect or cache validation, such as 304.
- 4xx means client-side problem, such as 400, 401, 403, 404, 409, 422, 429.
- 5xx means server-side or upstream problem, such as 500, 502, 503, 504.
- Use one consistent error body shape with status codes.

## 4. Visual / analogy

```txt
Client sends request -> server returns status class -> client decides next behavior.
```

## 5. Minimal example

```txt
res.status(201).json({ data: createdUser })
```

## 6. Real-world example

A form submit returns 422 with field errors; a missing order returns 404; a rate-limited request returns 429.

## 7. Common interview questions

#### What are HTTP status codes?
- **The Engine Mechanism (Why it behaves this way):** HTTP status codes are three-digit numbers returned by the server in the response header that indicate the result of processing the request. They are grouped into five classes: 1xx (informational), 2xx (success), 3xx (redirection), 4xx (client error), and 5xx (server error). The backend framework sets the status code based on the handler's outcome — successful creation returns 201, validation failure returns 422, missing resource returns 404, unhandled exception returns 500. HTTP infrastructure (caches, proxies, load balancers) uses these codes to determine behavior like caching, retrying, or routing.
- **The Unforgettable Mental Model:** Status codes are the **traffic light system of the web**. Green (2xx) = go ahead, Yellow (3xx) = redirect, Red (4xx) = your fault, Flashing Red (5xx) = server's fault.
- **The Trap:** Returning 200 OK for all responses and putting error details in the body. This breaks HTTP semantics — clients, proxies, and monitoring tools rely on status codes to determine success or failure without parsing the body.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: HTTP status codes are three-digit numbers in the response header that communicate the result of processing a request. They're grouped into five classes: 2xx for success, 3xx for redirection, 4xx for client errors, and 5xx for server errors. The backend sets the appropriate code based on the outcome — 201 for created resources, 400 for malformed requests, 404 for missing resources, 422 for validation failures, 500 for internal errors. These codes let clients, proxies, and monitoring tools understand the result without parsing the response body."

#### Why do HTTP status codes matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Status codes are the primary communication channel between server and client about request outcomes. They enable automated client behavior — retry on 503, refresh auth on 401, show validation errors on 422, cache on 200 with proper headers. They enable infrastructure behavior — load balancers route around 502s, CDNs cache 200s but not 404s, monitoring systems alert on 5xx rates. Without consistent status codes, every client must parse custom error formats and infrastructure cannot make routing or caching decisions.
- **The Unforgettable Mental Model:** Status codes are the **universal language of the web**. A 404 means "not found" in every language, framework, and country — no translation needed.
- **The Trap:** Using non-standard status codes or inventing custom ones. The HTTP specification defines the meaning of each code. Using 200 for errors or 500 for client mistakes breaks the contract that all HTTP clients and infrastructure depend on.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Status codes matter because they're the universal communication protocol between servers, clients, and infrastructure. They enable automated client behavior — retrying on 503, refreshing tokens on 401, displaying validation errors on 422. They enable infrastructure decisions — load balancers route around unhealthy instances returning 502s, CDNs cache successful responses, and monitoring systems alert on elevated 5xx rates. Consistent status code usage makes APIs predictable, debuggable, and compatible with the entire HTTP ecosystem."

#### How would you explain HTTP status codes in an interview?
- **The Engine Mechanism (Why it behaves this way):** Start with the five-class grouping, then give concrete examples for each class that a backend developer would use. Emphasize that status codes are not arbitrary — they're part of the HTTP specification and carry semantic meaning that the entire web ecosystem depends on. Connect them to real API scenarios: form submission (422), authentication (401), authorization (403), resource creation (201), and server failure (500).
- **The Unforgettable Mental Model:** Think of status codes as **report card grades**. 2xx = A (success), 3xx = B+ (redirect, still good), 4xx = F (student's fault), 5xx = F (teacher's fault).
- **The Trap:** Memorizing every code instead of understanding the class system. Interviewers want to see that you understand when to use 4xx vs 5xx, not that you know the difference between 418 and 451.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I think about status codes in five classes. 2xx means success — 200 for OK, 201 for created, 204 for no content. 3xx means redirect — 301 for permanent, 304 for not modified. 4xx means the client made a mistake — 400 for bad request, 401 for unauthenticated, 403 for unauthorized, 404 for not found, 422 for validation errors, 429 for rate limited. 5xx means the server failed — 500 for internal error, 502 for bad gateway, 503 for service unavailable. The key principle: 4xx means the client should change something; 5xx means the server needs fixing."

#### What bugs happen when status codes are handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Returning 200 for errors causes clients to treat failures as successes, leading to silent data corruption. Returning 500 for client errors causes unnecessary alerting and retry storms. Returning 404 for auth failures confuses clients about whether the resource exists or credentials are invalid. Inconsistent error codes make frontend error handling chaotic — each endpoint requires custom logic instead of a unified error handler. Monitoring systems miss real issues because error rates are diluted with incorrect codes.
- **The Unforgettable Mental Model:** Bad status codes are like **mislabeling emergency exits**. When a real emergency happens, nobody knows which door to use.
- **The Trap:** Returning 200 with `{ "success": false, "error": "..." }` — this is the most common anti-pattern. The HTTP status code is 200 (success), but the body says failure. Proxies cache it as success, monitoring misses it, and clients must parse the body to detect errors.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor status code handling causes several production bugs. Returning 200 for errors makes clients treat failures as successes, leading to silent data corruption. Returning 500 for client errors triggers false alerts and unnecessary retries. Inconsistent codes force frontend teams to write custom error handling per endpoint instead of a unified handler. Monitoring systems miss real issues because error rates are inaccurate. The most common anti-pattern is returning 200 with an error in the body — this breaks caching, monitoring, and client error handling all at once."

#### How do HTTP status codes affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients use status codes to determine UI behavior. 401 triggers a login redirect or token refresh. 403 shows an access denied message. 404 shows a not-found page. 422 displays field-level validation errors next to form inputs. 429 shows a "try again later" message with a countdown. 500 shows a generic error page. HTTP libraries like axios and fetch use status codes to determine whether to resolve or reject the promise — responses with 4xx/5xx status codes trigger the error branch.
- **The Unforgettable Mental Model:** Status codes are the **director's cues** for the frontend. 401 = "cut to login scene," 404 = "show empty stage," 500 = "drop the curtain."
- **The Trap:** Not handling all status code classes in the frontend. Only checking for 200 means 401, 403, 429, and 500 all fall into the same error handler, showing confusing messages to users.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Frontend clients rely on status codes to drive UI behavior. 401 triggers login flows or token refresh. 403 shows access denied. 404 shows a not-found page. 422 displays field-level validation errors. 429 shows rate limit messages. 500 shows a generic error page. HTTP libraries resolve promises for 2xx responses and reject for 4xx/5xx, so status codes determine which code path executes. Consistent status codes let the frontend implement a single error handler that routes to the right UI based on the code."

#### How would you test HTTP status codes?
- **The Engine Mechanism (Why it behaves this way):** Status code testing involves sending requests with various inputs and verifying the response code matches expectations. Unit tests mock the database and test handler logic paths. Integration tests use a test server with a real database to verify the full pipeline. Contract tests verify that the API returns expected codes for documented scenarios. Load tests verify that status codes remain correct under stress — no 500s from timeouts, proper 429s from rate limiting. Tools like Supertest, Postman, or k6 automate status code assertions.
- **The Unforgettable Mental Model:** Testing status codes is like **fire drills**. You simulate every emergency scenario and verify the right alarm sounds every time.
- **The Trap:** Only testing the happy path (200/201). The most important tests are for error paths — 400, 401, 403, 404, 422, 429, 500 — because that's where bugs hide and where clients need reliable behavior.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test status codes at multiple levels. Unit tests verify handler logic returns the right codes for different scenarios. Integration tests spin up a test server with a real database and verify the full pipeline — valid requests return 2xx, malformed requests return 400, auth failures return 401, validation failures return 422, and unhandled errors return 500. I also test edge cases like rate limiting returning 429 and concurrent requests maintaining correct codes. The most critical tests are for error paths, not just the happy path."

## 8. Active recall test

1. **Explain HTTP status codes without looking at notes.**
   - **Explanation:** HTTP status codes are three-digit numbers grouped into five classes: 1xx informational, 2xx success (200 OK, 201 Created, 204 No Content), 3xx redirection (301 Moved, 304 Not Modified), 4xx client error (400 Bad Request, 401 Unauthenticated, 403 Forbidden, 404 Not Found, 422 Validation Error, 429 Rate Limited), and 5xx server error (500 Internal Error, 502 Bad Gateway, 503 Unavailable). They communicate request outcomes to clients and infrastructure.

2. **Give one production bug related to HTTP status codes.**
   - **Explanation:** Returning 200 OK for validation errors with `{ "success": false }` in the body causes HTTP caches to store the error response as a successful result. Subsequent valid requests receive the cached error, and monitoring systems don't detect the elevated error rate because all responses show 200.

3. **Give one API example where status codes matter.**
   - **Explanation:** A payment API must return 201 for successful charges, 402 for payment failures, 422 for invalid card data, 429 for rate-limited retry attempts, and 502 if the payment gateway is unreachable. Each code triggers different client behavior — retry, show error, or escalate.

4. **Explain how a frontend client should react to HTTP status codes.**
   - **Explanation:** The frontend should use a centralized error handler that routes based on status code: 401 triggers token refresh or login redirect, 403 shows access denied, 404 shows not-found page, 422 extracts field errors and displays them on form inputs, 429 shows a retry countdown, and 5xx shows a generic error page with a retry option.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

HTTP Status Codes is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain HTTP Status Codes in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define HTTP Status Codes in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
