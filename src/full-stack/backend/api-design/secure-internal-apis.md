# Secure Internal APIs

## Detailed explanation

Protect service-to-service APIs with network controls, identity, least privilege, and observability. A strong answer explains endpoint shape, validation, authentication or authorization, idempotency where needed, database changes, error responses, observability, and frontend contract impact.

## 1. One-line mental model

Internal does not mean trusted by default.

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

In production, secure internal apis should define request schema, response schema, error codes, permission rules, rate limits, and logging fields before implementation starts.

## 7. Common interview questions

#### What makes internal APIs different from public APIs?
- **The Engine Mechanism (Why it behaves this way):** Internal APIs operate within a trusted network but still require security. Differences: (1) Authentication — service-to-service auth (mTLS, service tokens) instead of user auth; (2) No CORS — not needed for server-to-server; (3) Higher rate limits — internal services communicate more frequently; (4) Richer error details — internal clients can handle detailed errors; (5) Network-level security — VPC, security groups, private subnets replace some application-layer controls.
- **The Unforgettable Mental Model:** The **Office Building vs. Public Storefront**. The storefront (public API) needs guards, ID checks, and visitor badges. The office building (internal API) has badge access (mTLS), no visitor restrictions (no CORS), and colleagues can share detailed information (rich errors).
- **The Trap:** Assuming internal means no security — internal APIs are still attack surfaces, especially if the network is compromised or a service is breached.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Internal APIs use service-to-service authentication like mTLS instead of user auth, don't need CORS, have higher rate limits, can return richer error details, and rely on network-level security like VPCs and security groups. But 'internal' doesn't mean 'no security' — internal APIs are still attack surfaces if the network is compromised."

#### What authentication methods work for internal APIs?
- **The Engine Mechanism (Why it behaves this way):** Internal auth methods: (1) mTLS — mutual TLS, both client and server verify certificates (strongest); (2) Service tokens — JWT tokens issued to services by an identity provider; (3) API keys — simple but less secure; (4) IAM roles — cloud provider identity (AWS IAM, GCP service accounts); (5) SPIFFE/SPIRE — workload identity standard. mTLS and service tokens are the most common for microservices.
- **The Unforgettable Mental Model:** The **Secure Inter-Office Mail**. mTLS is like sealed envelopes with verified sender and recipient stamps. Service tokens are like internal memos with verified department signatures. IAM roles are like building access badges tied to your employment.
- **The Trap:** Using shared API keys for service-to-service auth — if one service is compromised, the key is exposed and all services using it are at risk.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use mTLS for the strongest service-to-service authentication, service tokens (JWT) issued by an identity provider, cloud IAM roles for managed services, and SPIFFE/SPIRE for workload identity. Shared API keys are a risk — if one service is compromised, all services using the key are exposed. mTLS provides mutual verification of both client and server."

#### How do you implement network security for internal APIs?
- **The Engine Mechanism (Why it behaves this way):** Network security: (1) VPC isolation — internal APIs run in private subnets; (2) Security groups — allow only specific service-to-service traffic; (3) Private endpoints — no public IP addresses; (4) Service mesh — Istio/Linkerd for encrypted service communication; (5) Network policies — Kubernetes network policies for pod-to-pod traffic; (6) Zero trust — verify every request regardless of source.
- **The Unforgettable Mental Model:** The **Compartmentalized Ship**. Each compartment (subnet) is sealed, doors between compartments (security groups) only open for authorized traffic, and the ship's internal communication system (service mesh) encrypts all messages.
- **The Trap:** Relying solely on network perimeter security — if an attacker breaches the perimeter, they have unrestricted access to all internal services. Zero trust adds verification at every level.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I isolate internal APIs in private subnets within a VPC, use security groups to allow only specific service-to-service traffic, avoid public IPs, use service mesh for encrypted communication, apply Kubernetes network policies, and adopt zero trust principles. Network perimeter security alone is insufficient — zero trust verifies every request regardless of source."

#### How do you handle error responses for internal APIs?
- **The Engine Mechanism (Why it behaves this way):** Internal error responses can include: detailed error messages, stack traces (in development), full validation errors, internal error codes, debugging context, and request traces. Internal clients can handle rich error information for better debugging and automated retry logic. However, sensitive data (credentials, PII) should still be excluded.
- **The Unforgettable Mental Model:** The **Detailed Incident Report**. Internal teams get the full report: what happened, why, where, and how to fix it. But confidential information (credentials, PII) is still redacted.
- **The Trap:** Including sensitive data in internal error responses — even internal errors should not expose credentials, tokens, or PII.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Internal APIs can return detailed error messages, validation errors, internal error codes, debugging context, and request traces. This rich information helps internal clients debug and implement automated retry logic. However, sensitive data like credentials, tokens, and PII should still be excluded — internal doesn't mean 'no data classification.'"

#### How do you rate limit internal APIs?
- **The Engine Mechanism (Why it behaves this way):** Internal rate limiting: (1) Higher limits than public APIs — internal services communicate frequently; (2) Per-service limits — each calling service has its own quota; (3) Circuit breakers — prevent cascading failures when a service is overwhelmed; (4) Backpressure — signal calling services to slow down; (5) Priority queues — critical services get higher priority. Rate limiting protects against cascading failures, not just abuse.
- **The Unforgettable Mental Model:** The **Traffic Control System**. Each lane (service) has its own speed limit, traffic lights (circuit breakers) stop flow when congestion occurs, and emergency vehicles (critical services) get priority lanes.
- **The Trap:** Not implementing circuit breakers — without them, a failing service causes all calling services to pile up requests, creating a cascading failure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Internal APIs have higher rate limits than public APIs, with per-service quotas. I implement circuit breakers to prevent cascading failures, backpressure to signal calling services to slow down, and priority queues for critical services. Rate limiting for internal APIs is about protecting against cascading failures, not just abuse prevention."

#### How do you monitor internal API health?
- **The Engine Mechanism (Why it behaves this way):** Monitoring: (1) Service-level metrics — latency, error rate, throughput (RED method); (2) Dependency tracking — service dependency graph; (3) Distributed tracing — request flow across services; (4) Health checks — liveness and readiness probes; (5) SLI/SLO tracking — service level indicators and objectives; (6) Alerting — automated alerts for SLO violations.
- **The Unforgettable Mental Model:** The **Service Health Dashboard**. Each service shows its vital signs (latency, errors, throughput), the dependency map shows connections, distributed traces show request journeys, and alerts fire when health degrades.
- **The Trap:** Monitoring only individual services without tracking dependencies — cascading failures originate from dependency chains, not individual services.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use the RED method (Rate, Errors, Duration) for service-level metrics, track service dependencies, implement distributed tracing for request flows, use health checks for liveness and readiness, track SLIs/SLOs, and alert on SLO violations. Dependency tracking is critical — cascading failures originate from dependency chains, not individual services."

#### How do you test internal API security?
- **The Engine Mechanism (Why it behaves this way):** Security testing: (1) mTLS certificate validation — verify certificate chains; (2) Service token verification — validate JWT signatures and claims; (3) Network policy testing — verify only allowed traffic flows; (4) Penetration testing — simulate compromised service; (5) Chaos engineering — test failure scenarios; (6) Contract testing — verify service interfaces remain compatible.
- **The Unforgettable Mental Model:** The **Security Drill**. Certificates are verified, tokens are validated, network policies are tested, a simulated breach tests response, chaos engineering tests resilience, and contract tests ensure compatibility.
- **The Trap:** Not testing with a compromised service scenario — internal security should assume a service can be breached and test whether the breach is contained.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test mTLS certificate validation, service token verification, network policy enforcement, and simulate compromised service scenarios to test containment. Chaos engineering tests failure resilience, and contract tests ensure interface compatibility. Testing with a compromised service scenario is critical — internal security should assume breach and verify containment."

#### What logs and metrics would you add for internal API security?
- **The Engine Mechanism (Why it behaves this way):** Logs: service-to-service requests (caller, endpoint, timestamp, status, latency), authentication failures, certificate expirations, network policy violations, circuit breaker trips. Metrics: inter-service latency, error rate by service pair, certificate expiry timeline, circuit breaker state, dependency health. Alerts: certificate expiry approaching, circuit breaker trips, inter-service error rate spikes, unauthorized access attempts.
- **The Unforgettable Mental Model:** The **Internal Security Operations Center**. Service communication is monitored, certificate health is tracked, circuit breaker states are visible, and anomalies trigger alerts.
- **The Trap:** Not tracking certificate expiration — expired mTLS certificates cause service-to-service communication failures that are hard to diagnose.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I log service-to-service requests with caller, endpoint, status, and latency. Metrics track inter-service latency, error rates by service pair, certificate expiry timelines, and circuit breaker states. I alert on certificate expiry approaching, circuit breaker trips, inter-service error spikes, and unauthorized access. Certificate expiry tracking is critical — expired certificates cause hard-to-diagnose communication failures."

## 8. Active recall test

1. **What is the key difference between internal and public API authentication?**
   - **Explanation:** Internal APIs use service-to-service auth (mTLS, service tokens) while public APIs use user authentication (OAuth2, API keys, sessions).

2. **Why is mTLS the strongest internal authentication method?**
   - **Explanation:** It verifies both the client and server certificates, providing mutual authentication — both parties prove their identity cryptographically.

3. **Why don't internal APIs need CORS?**
   - **Explanation:** CORS is a browser security feature for cross-origin requests — server-to-server communication doesn't go through browsers, so CORS is irrelevant.

4. **What is the purpose of circuit breakers in internal APIs?**
   - **Explanation:** To prevent cascading failures — when a service is overwhelmed, the circuit breaker stops requests from piling up and gives the service time to recover.

5. **What is the RED method for monitoring?**
   - **Explanation:** Rate (requests per second), Errors (error rate), Duration (latency) — three key metrics that capture service health.

6. **Why track service dependencies?**
   - **Explanation:** Cascading failures originate from dependency chains — understanding dependencies helps identify failure propagation paths and prioritize fixes.

7. **What should internal error responses still exclude?**
   - **Explanation:** Credentials, tokens, PII, and any sensitive data — even internal errors should follow data classification rules.

8. **What is zero trust in the context of internal APIs?**
   - **Explanation:** Verify every request regardless of source — don't trust requests just because they come from within the network.

9. **Why is certificate expiry tracking critical for mTLS?**
   - **Explanation:** Expired certificates cause service-to-service communication failures that are hard to diagnose — proactive tracking prevents outages.

10. **What test scenario is most important for internal API security?**
    - **Explanation:** Simulated compromised service — test whether a breached service's access is contained and doesn't spread to other services.

## 9. Mistakes / traps

- Designing only the happy path.
- Ignoring idempotency, retries, and partial failure.
- Trusting frontend validation.
- Returning inconsistent error shapes.
- Forgetting authorization and ownership checks.

## 10. Compare with related concepts

This is an API design scenario, not just a concept definition. It combines HTTP semantics, validation, auth, data modeling, errors, and operational behavior.

## 11. Summary from memory

Explain the endpoints, request body, response body, errors, security checks, and production risks for Secure Internal APIs.

## 12. Spaced revision prompts

- Day 1: Sketch endpoint names and methods.
- Day 3: Add validation and error cases.
- Day 7: Add auth, idempotency, and logging.
- Day 14: Explain how frontend consumes the API safely.
