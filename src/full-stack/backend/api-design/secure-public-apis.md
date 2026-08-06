# Secure Public APIs

## Detailed explanation

Protect externally reachable APIs with auth, rate limits, validation, abuse controls, and minimal data exposure. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Public APIs must assume hostile traffic.

## 2. Problem it solves

This design prevents inconsistent client behavior, duplicated backend logic, unclear errors, security gaps, and production-only workflow bugs.

## 3. Core idea

- Define the resource or workflow clearly.
- Validate input at the API boundary.
- Enforce authentication, authorization, and ownership checks.
- Return consistent success and error shapes.
- Plan idempotency, retries, logging, and monitoring for production behavior.

## 4. Visual / analogy

```txt
Client request
  -> auth/validation
  -> domain rules
  -> database/cache/queue
  -> serialized response/error
  -> frontend behavior
```

## 5. Minimal example

```txt
REQUEST  /api/example
CHECK    auth + validation + domain rules
WRITE    database or enqueue job
RETURN   status code + response body
```

## 6. Real-world example

In production, secure public apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What makes a public API secure?
- **The Engine Mechanism (Why it behaves this way):** Public API security assumes hostile traffic. Layers include: (1) Authentication — API keys, OAuth2, JWT tokens; (2) Rate limiting — per-key, per-IP, per-endpoint limits; (3) Input validation — strict schema validation, sanitization; (4) CORS — restrict allowed origins; (5) HTTPS only — encrypt all traffic; (6) Minimal data exposure — return only necessary fields; (7) Audit logging — track all requests for anomaly detection.
- **The Unforgettable Mental Model:** The **Fortress with Checkpoints**. Outer wall (HTTPS), gate guard (authentication), turnstile (rate limiting), package inspection (input validation), visitor badge (CORS), and security cameras (audit logging).
- **The Trap:** Relying on a single security layer — defense in depth is essential. If rate limiting fails, authentication should still protect the API.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Public APIs assume hostile traffic and use defense in depth. Authentication controls who can access the API. Rate limiting prevents abuse. Input validation prevents injection attacks. CORS restricts which origins can call the API. HTTPS encrypts all traffic. Minimal data exposure reduces the impact of any breach. And audit logging enables anomaly detection and incident response."

#### What authentication methods work for public APIs?
- **The Engine Mechanism (Why it behaves this way):** Authentication methods: (1) API keys — simple, good for server-to-server; (2) OAuth2 — standard for user-delegated access; (3) JWT tokens — stateless, good for microservices; (4) API key + secret — HMAC signing for request integrity. Choice depends on use case: API keys for developer APIs, OAuth2 for user data access, JWT for service-to-service.
- **The Unforgettable Mental Model:** The **ID System**. API keys are like employee badges (simple access). OAuth2 is like a visitor pass granted by the employee (delegated access). JWT is like a self-verifying ID card (stateless verification).
- **The Trap:** Using API keys for user authentication — API keys identify applications, not users. User authentication requires OAuth2 or session-based auth.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use API keys for server-to-server and developer APIs, OAuth2 for user-delegated access, JWT for stateless service-to-service auth, and API key + secret with HMAC signing for request integrity. API keys identify applications, not users — for user authentication, OAuth2 or session-based auth is required."

#### How do you implement rate limiting for public APIs?
- **The Engine Mechanism (Why it behaves this way):** Rate limiting strategies: (1) Fixed window — N requests per time window (simple, but allows bursts at window boundaries); (2) Sliding window — N requests per rolling window (smoother); (3) Token bucket — tokens replenish at a rate, each request consumes one (allows bursts); (4) Leaky bucket — requests processed at a constant rate (smoothest). Implement with Redis for distributed systems. Return `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers.
- **The Unforgettable Mental Model:** The **Water Meter**. Fixed window resets the meter monthly (burst at reset). Sliding window tracks the last 30 days (smooth). Token bucket is like a rain barrel — fills steadily, each use drains it (allows bursts). Leaky bucket drips at a constant rate (smoothest flow).
- **The Trap:** Not returning rate limit headers — clients need to know their remaining quota to implement backoff and avoid hitting limits unexpectedly.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use token bucket or sliding window rate limiting implemented with Redis for distributed systems. I return rate limit headers (Limit, Remaining, Reset) so clients can implement backoff. Rate limits are set per API key, per IP, and per endpoint. The token bucket allows controlled bursts while maintaining overall throughput limits."

#### How do you prevent injection attacks on public APIs?
- **The Engine Mechanism (Why it behaves this way):** Injection prevention: (1) Parameterized queries — never concatenate user input into SQL; (2) Input sanitization — strip or escape dangerous characters; (3) Schema validation — reject unexpected fields; (4) Content-Type enforcement — only accept expected content types; (5) Output encoding — encode data in responses to prevent XSS; (6) WAF — web application firewall for additional protection.
- **The Unforgettable Mental Model:** The **Water Treatment Plant**. Raw water (user input) goes through multiple treatment stages: filtration (schema validation), chemical treatment (sanitization), UV sterilization (parameterized queries), and quality testing (WAF) before it's safe to drink.
- **The Trap:** Only sanitizing on the frontend — attackers bypass the frontend and send malicious input directly to the API.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use parameterized queries for all database operations, schema validation to reject unexpected fields, input sanitization for dangerous characters, Content-Type enforcement, output encoding for XSS prevention, and a WAF for additional protection. Frontend sanitization is not sufficient — attackers bypass the frontend and hit the API directly."

#### How do you handle CORS for public APIs?
- **The Engine Mechanism (Why it behaves this way):** CORS configuration: (1) Allow specific origins — not wildcard `*` for credentialed requests; (2) Allow specific methods — GET, POST, etc.; (3) Allow specific headers — Content-Type, Authorization; (4) Set max-age for preflight caching; (5) Don't expose sensitive headers; (6) For truly public read-only APIs, `*` is acceptable. CORS is a browser security feature, not a server security feature.
- **The Unforgettable Mental Model:** The **Visitor Access List**. Only approved websites (origins) can interact with the API from the browser. The list specifies what they can do (methods) and what they can bring (headers).
- **The Trap:** Thinking CORS prevents server-to-server attacks — CORS only affects browser-based requests. Server-to-server requests bypass CORS entirely.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I configure CORS with specific allowed origins, methods, and headers — not wildcards for credentialed requests. I set preflight cache max-age and avoid exposing sensitive headers. CORS is a browser security feature, not a server security feature — it doesn't prevent server-to-server attacks. For truly public read-only APIs, wildcard origins are acceptable."

#### How do you minimize data exposure in public APIs?
- **The Engine Mechanism (Why it behaves this way):** Data minimization: (1) Response field filtering — return only necessary fields; (2) Field selection — allow clients to request specific fields (`?fields=id,name`); (3) Pagination — limit response size; (4) Data classification — never return sensitive fields (passwords, internal IDs); (5) API-specific views — different endpoints return different data subsets; (6) Versioning — old versions may expose fields that new versions hide.
- **The Unforgettable Mental Model:** The **Need-to-Know Briefing**. Each recipient gets only the information they need for their task — no more, no less. The full dossier exists, but only relevant excerpts are shared.
- **The Trap:** Returning the full database record — internal fields, timestamps, and metadata that clients don't need are potential information leaks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I filter response fields to return only what clients need, support field selection queries, paginate large results, classify data to exclude sensitive fields, and use API-specific views for different data subsets. Returning full database records is a common mistake — internal fields and metadata are information leaks."

#### How do you monitor and detect abuse on public APIs?
- **The Engine Mechanism (Why it behaves this way):** Abuse detection: (1) Request pattern analysis — detect scraping, enumeration, brute force; (2) Anomaly detection — unusual traffic spikes, geographic anomalies; (3) Rate limit violation tracking — repeated limit hits; (4) Error rate monitoring — high error rates suggest probing; (5) Behavioral analysis — bot detection, fingerprinting; (6) Alerting — automated alerts for suspicious patterns.
- **The Unforgettable Mental Model:** The **Security Operations Center**. Traffic patterns are analyzed in real-time, anomalies are flagged, and automated alerts trigger investigation of suspicious activity.
- **The Trap:** Only monitoring error rates — sophisticated attackers probe slowly to stay under detection thresholds. Pattern analysis is needed to catch slow attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor request patterns for scraping and enumeration, detect traffic anomalies, track rate limit violations, monitor error rates for probing signals, analyze behavioral patterns for bot detection, and set automated alerts for suspicious activity. Slow, distributed attacks are the hardest to detect — they require pattern analysis over time, not just threshold-based alerting."

#### What logs and metrics would you add for public API security?
- **The Engine Mechanism (Why it behaves this way):** Logs: all requests (API key, IP, endpoint, timestamp, status, latency), authentication failures, rate limit hits, validation failures, CORS violations. Metrics: requests per key/IP, error rate by type, rate limit trigger rate, authentication failure rate, response time distribution, geographic distribution. Alerts: traffic spikes, authentication failure spikes, rate limit abuse patterns, unusual geographic access.
- **The Unforgettable Mental Model:** The **Security Dashboard**. Real-time view of API traffic, authentication health, rate limiting effectiveness, and anomaly detection alerts.
- **The Trap:** Not logging request latency — slow endpoints are targets for DoS attacks, and latency anomalies can indicate abuse.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log all requests with API key, IP, endpoint, status, and latency. Metrics track request volume per key/IP, error rates, rate limit triggers, authentication failures, and response times. I alert on traffic spikes, authentication failure spikes, rate limit abuse, and unusual geographic access. Request latency monitoring is important — slow endpoints are DoS targets."

## 8. Active recall test

1. **What is the core principle of public API security?**
   - **Explanation:** Assume hostile traffic and use defense in depth — multiple security layers ensure that if one fails, others still protect the API.

2. **What is the difference between API keys and OAuth2?**
   - **Explanation:** API keys identify applications (server-to-server), while OAuth2 provides user-delegated access (user authorizes an app to access their data).

3. **Which rate limiting strategy allows controlled bursts?**
   - **Explanation:** Token bucket — tokens replenish at a steady rate, and each request consumes a token, allowing bursts when tokens are available.

4. **Why return rate limit headers in API responses?**
   - **Explanation:** So clients can implement backoff strategies and avoid hitting rate limits unexpectedly — it enables graceful degradation.

5. **What prevents SQL injection in API handlers?**
   - **Explanation:** Parameterized queries — user input is never concatenated into SQL strings, preventing injection of malicious SQL code.

6. **Why is CORS not a server security feature?**
   - **Explanation:** CORS only affects browser-based requests — server-to-server requests bypass CORS entirely, so it doesn't protect against non-browser attacks.

7. **What is the risk of returning full database records in API responses?**
   - **Explanation:** Internal fields, timestamps, and metadata are information leaks that expose implementation details and potentially sensitive data.

8. **What type of attack is hardest to detect with threshold-based monitoring?**
   - **Explanation:** Slow, distributed attacks — they stay below individual thresholds but collectively cause damage over time, requiring pattern analysis.

9. **Why is frontend input sanitization insufficient?**
   - **Explanation:** Attackers bypass the frontend and send malicious input directly to the API — server-side validation and sanitization is mandatory.

10. **What metric indicates potential API abuse?**
    - **Explanation:** Repeated rate limit hits from a single key/IP, high authentication failure rates, or unusual traffic patterns — all suggest probing or abuse.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Secure Public APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
