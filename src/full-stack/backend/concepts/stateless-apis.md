# Stateless Backend APIs

## Detailed explanation

A stateless API does not rely on server memory from previous requests; every request carries enough information for the server to process it.

## 1. One-line mental model

Each request must stand on its own.

## 2. Problem it solves

Stateful request handling makes scaling, retries, and load balancing harder because one server must remember previous interactions.

## 3. Core idea

- Auth state usually comes from a token, session id, or cookie sent with each request.
- Server can still use databases, caches, and sessions; stateless means no per-request memory dependency in app workers.
- Stateless APIs work better behind load balancers.
- They are easier to retry and horizontally scale.
- Do not confuse stateless APIs with no stored data.

## 4. Visual / analogy

```txt
Every request brings its own passport.
```

## 5. Minimal example

```txt
app.get("/me", authFromCookieOrToken, handler)
```

## 6. Real-world example

Any server instance can handle `GET /me` because the request includes the session cookie.

## 7. Common interview questions

#### What does it mean for an API to be stateless?
- **The Engine Mechanism (Why it behaves this way):** A stateless API means the server does not store any client-specific context between requests. Every request must contain all information needed to process it — authentication tokens, resource identifiers, operation parameters. The server processes each request independently without relying on in-memory state from previous interactions. This doesn't mean the API has no database — it means no per-client session state lives in the application server's memory. Authentication state comes from tokens or cookies sent with each request, not from server-side session objects.
- **The Unforgettable Mental Model:** Stateless is like a **vending machine** — every transaction is independent. The machine doesn't remember what you bought last time or hold any state about you between purchases.
- **The Trap:** Confusing stateless with "no database." A stateless API can use databases, caches, and external stores extensively. Stateless specifically means no in-memory session state that ties a client to a particular server instance.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A stateless API means the server doesn't store client context between requests. Every request carries all the information needed to process it — typically authentication tokens, resource IDs, and operation parameters. The server processes each request independently, without relying on in-memory state from previous interactions. This doesn't mean no database — it means no per-client session state in the application server's memory. Statelessness enables horizontal scaling because any server instance can handle any request."

#### Why does statelessness matter for backend systems?
- **The Engine Mechanism (Why it behaves this way):** Statelessness is the foundation of horizontal scaling. When servers don't hold client-specific state, a load balancer can route any request to any server instance. If a server crashes, no client sessions are lost — the client simply retries with their token. Stateless APIs are easier to deploy (no session draining), easier to scale (add instances without session replication), and easier to recover (restart any instance without data loss). Stateful servers require sticky sessions, session replication, or shared session stores, all of which add complexity and failure modes.
- **The Unforgettable Mental Model:** Stateless servers are like **identical checkout lanes** at a grocery store. Any customer can go to any lane. Stateful servers are like **assigned seating** — you must go back to your specific seat or lose your place.
- **The Trap:** Storing session data in server memory for convenience during development, then struggling to scale in production. What works on one server breaks on two.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Statelessness matters because it enables horizontal scaling, simplifies deployment, and improves fault tolerance. When servers don't hold client state, load balancers can route any request to any instance. If a server crashes, no sessions are lost — clients retry with their tokens. Stateful servers require sticky sessions or session replication, which adds complexity, limits scaling, and creates single points of failure. Stateless design is the foundation of cloud-native, horizontally scalable architectures."

#### What bugs happen when APIs are not stateless?
- **The Engine Mechanism (Why it behaves this way):** Non-stateless APIs cause several production issues. Sticky sessions tie users to specific servers, so if that server restarts, all its users lose their sessions. Session replication across servers adds latency and complexity. Deployments require draining sessions, slowing rollouts. Autoscaling becomes ineffective because new instances don't have existing session data. Load balancer health checks may pass while individual users experience failures because their session is on a dying instance.
- **The Unforgettable Mental Model:** Non-stateless bugs are like **a restaurant where your waiter memorizes your order**. If that waiter leaves, your order is lost. If the restaurant opens a second location, your waiter can't be in both places.
- **The Trap:** Using in-memory session stores (like Express's default session middleware with MemoryStore) in production. This works on one server but breaks immediately when you add a second instance.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Non-stateless APIs cause sticky session problems where users are tied to specific servers. If that server restarts, sessions are lost. Deployments require session draining, slowing rollouts. Autoscaling is ineffective because new instances lack session data. The fix is to move state out of server memory — use JWT tokens that carry their own context, or store sessions in a shared Redis cluster that all instances can access. This makes every server instance interchangeable."

#### How does statelessness affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients must include authentication credentials with every request — typically a JWT in the Authorization header or a session cookie. The client cannot assume the server remembers previous interactions. Token refresh logic must be client-driven: when a token expires, the client uses a refresh token to get a new one. The client handles retries independently since any server instance can process them. This makes the frontend more responsible for state management but also more resilient to server failures.
- **The Unforgettable Mental Model:** The frontend is like a **traveler with a passport**. Every border crossing (request) requires showing the passport (token) — the border agent doesn't remember you from last time.
- **The Trap:** Assuming the server maintains session state between API calls. The frontend must send credentials with every request, not just the first one.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: With stateless APIs, the frontend must include credentials with every request — typically a JWT in the Authorization header or a session cookie. The client manages token lifecycle, including refresh logic when tokens expire. The benefit is that any server can handle any request, so retries always work and server failures don't lose user sessions. The tradeoff is that the frontend carries more responsibility for state management, but this is a good tradeoff because it makes the system more resilient."

#### How would you test stateless API behavior?
- **The Engine Mechanism (Why it behaves this way):** Testing statelessness involves verifying that requests work regardless of which server instance handles them. In a multi-instance test environment, send a sequence of requests and verify each one succeeds independently — no request should depend on state from a previous request. Test token-based auth by sending requests with valid tokens to different instances. Test session loss by restarting a server instance mid-test and verifying requests still succeed. Load tests should confirm that distributing requests across instances doesn't cause session-related failures.
- **The Unforgettable Mental Model:** Testing statelessness is like **testing a chain of coffee shops**. Order at location A, then go to location B — you should be able to order there too with the same loyalty card.
- **The Trap:** Testing with a single server instance. Statelessness bugs only appear when multiple instances are involved. Always test stateless behavior with at least two server instances.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test statelessness by running multiple server instances and verifying that requests work regardless of which instance handles them. I send a sequence of requests with the same token and confirm each succeeds independently. I restart instances mid-test to verify no session data is lost. I also test with a load balancer distributing requests across instances to ensure no sticky session dependency. The key test is: if I kill any server instance, can all clients continue working by retrying their requests?"

## 8. Active recall test

1. **Explain stateless APIs without looking at notes.**
   - **Explanation:** A stateless API processes each request independently without storing client-specific context between requests. Every request carries all necessary information — authentication tokens, resource IDs, parameters. The server doesn't rely on in-memory state from previous interactions. This enables horizontal scaling, simple deployments, and fault tolerance.

2. **Give one production bug from non-stateless design.**
   - **Explanation:** Storing sessions in server memory causes user session loss when that server instance restarts or crashes. Users are logged out unexpectedly, and if sticky sessions are used, the load balancer continues routing to the dead instance until health checks detect the failure.

3. **Give one API example where statelessness matters.**
   - **Explanation:** A user profile API behind a load balancer with 6 instances. Each `GET /me` request includes a JWT. Any of the 6 instances can validate the token and return the profile. If instance 3 crashes, the next request goes to instance 5 and works seamlessly — no session data was lost.

4. **Explain how a frontend client should interact with a stateless API.**
   - **Explanation:** The frontend must include authentication credentials (JWT or session cookie) with every request. It manages token lifecycle — storing tokens, refreshing expired ones, and handling auth errors. It cannot assume the server remembers previous interactions. Each request is self-contained.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Stateless Backend APIs is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Stateless Backend APIs in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Stateless Backend APIs in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
