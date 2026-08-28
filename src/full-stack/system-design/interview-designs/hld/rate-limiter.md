# Rate Limiter

A distributed rate limiter decides whether a request may use a scarce shared resource before that request reaches an API or downstream service. The interview problem is therefore an **atomic distributed shared-state** problem: many stateless gateway nodes must make one consistent consumption decision for the same policy bucket.

This scope covers gateway or shared-service enforcement for per-user, per-IP, and per-tenant quotas. It does not attempt to replace volumetric DDoS protection, billing, or asynchronous job scheduling.

## 1. Clarify requirements

Functional requirements:

- Enforce policy by authenticated user or API key, source IP for anonymous traffic, tenant, route group, and a composite when needed, such as `tenant + user + route`.
- Return the decision before the protected service runs, with the applicable limit, remaining allowance, and retry time.
- Support tiered and route-specific policies; for example, an assumed login policy can be stricter than an assumed read-only API policy.
- Let operators change policies without editing mutable request counters.

The key invariant is: **two distributed gateway nodes cannot both consume the same last token.** A single atomic operation must read, refill, decide, decrement, and persist one bucket state.

Non-functional interview assumptions: the decision is on the synchronous request path, so it needs low and predictable latency; policy changes propagate quickly; and a regional limiter failure has an explicitly chosen behavior for each endpoint risk class.

## 2. Estimate scale

All values below are interview assumptions:

- Assume 100,000 peak requests per second across all gateway nodes and a 2 ms P99 budget for the limiter decision within one region.
- Assume 10 million active policy keys in a busy day, while only recently active keys occupy mutable bucket state because idle buckets expire.
- Assume an enterprise tenant may send 10,000 requests per second and therefore can be hot even when ordinary user keys distribute evenly.
- Assume the default product policy is 100 requests per minute with a burst capacity of 120 tokens; these are illustrative policy values, not universal limits.

At that assumed peak, a shared state store receives a decision per protected request, so the hot path must be O(1), horizontally partitioned, and protected from hot-key concentration.

## 3. Define APIs

An API gateway can enforce the rule inline, or call an internal contract such as:

```http
POST /limit/check
Content-Type: application/json

{
  "tenantId": "tenant-42",
  "principalId": "user-91",
  "sourceIp": "203.0.113.8",
  "routeGroup": "payments-write",
  "cost": 1
}
```

```json
{
  "allowed": true,
  "limit": 120,
  "remaining": 73,
  "retryAfterSeconds": 0,
  "policyVersion": "2026-08-28.4"
}
```

For an allowed external request, the gateway returns `RateLimit-Limit`, `RateLimit-Remaining`, and `RateLimit-Reset` headers. For a rejected request, it returns `429 Too Many Requests`, the same informative headers where safe, and `Retry-After`. The protected service never sees that rejected request. A request's `cost` is normally one token, but an assumed expensive route may cost more under an explicit policy.

## 4. Define the data model

Keep slow-changing policy configuration separate from high-churn bucket state.

```text
RateLimitPolicy(
  policyId, policyVersion, subjectType, routeGroup,
  capacity, refillTokensPerSecond, endpointRisk, enabled
)

BucketState(
  bucketKey, tokens, lastRefillAt, policyVersion, expiresAt
)
```

`RateLimitPolicy` belongs in a durable configuration store and is distributed to gateway policy caches. `BucketState` belongs in the partitioned low-latency store and is disposable after its expiry. A canonical key can be `rl:{region}:{tenantId}:{subjectType}:{subjectId}:{routeGroup}`. The policy evaluator decides whether to apply tenant, user, IP, and route buckets together; a request passes only if every required bucket can atomically pay its cost.

## 5. Draw the high-level architecture

```text
Client
  -> edge / API gateway
       -> identity + route classifier
       -> local policy cache <--- policy service <--- config store
       -> atomic token-bucket operation ---> partitioned Redis-compatible store
       <- {allowed, remaining, reset, policyVersion}
  -> protected service (only when allowed)

Gateway and limiter telemetry -> metrics / event stream -> alerts and dashboards
```

Gateway nodes are stateless and may be scaled independently. The policy path is cacheable because configuration changes relatively rarely; the consumption path is shared mutable state and must not be satisfied from an uncoordinated gateway-local counter.

## 6. Walk through the main request flow

1. The gateway authenticates the request when possible, determines the source IP, normalizes the route into a policy group, and derives the applicable keys.
2. It reads the current policy from its versioned local cache. A cache miss fetches the policy service; an unknown policy takes the endpoint's conservative default.
3. The gateway sends the bucket keys, policy parameters, request cost, and a trusted time value to one atomic Redis Lua script (or an equivalent compare-and-set retry loop).
4. The operation refills each bucket from elapsed time, checks whether all have enough tokens, and decrements all required buckets only when the request is allowed.
5. It returns one decision and remaining/reset metadata. The gateway adds rate-limit headers and forwards an allowed request, or stops a rejected request with `429` and `Retry-After`.
6. The gateway emits an asynchronous allow/deny metric without making the client wait for telemetry.

The script executes the check and update together. Thus if two gateways observe a bucket with one token, exactly one script invocation decrements it; the other returns denied. There is no separate read-then-write race.

## 7. Identify bottlenecks

Hot tenants, popular shared API keys, NATed IP addresses, and attack traffic can concentrate requests onto one bucket key and one state-store shard. Policy-cache misses can also stampede the configuration service after an invalidation. A globally shared counter makes cross-region latency and availability worse.

The state store is deliberately on the critical path, so overload or latency there can become a cascading gateway failure. Large sliding-window logs are another bottleneck: per-request timestamp storage amplifies memory and write work.

## 8. Scale each component

Scale gateways horizontally behind regional load balancers. Partition bucket state by a stable hash of the canonical bucket key; use hash tags only when a single atomic operation must evaluate related keys on one shard.

For a hot tenant, add a tenant-wide bucket plus bounded, independently enforced sub-buckets by user or API key. This prevents one tenant from taking regional capacity while avoiding an unbounded fan-in to a single global counter. If the product requires one exact tenant-wide limit, route that tenant's key consistently to its owning partition and size that partition deliberately; do not pretend that eventually merged local counters are an exact global quota.

Use local policy caches with versioned invalidations, request coalescing for cache misses, and separate capacity pools for normal traffic versus abuse-prone routes. Autoscale gateway and state-store capacity from decision latency, shard saturation, and deny-rate signals.

## 9. Caching strategy

Cache `RateLimitPolicy` at the gateway with a bounded TTL, a policy version, and push or poll invalidation from the policy service. On receiving a newer version, replace the cache entry before evaluating subsequent requests; existing bucket state may be migrated lazily or reset only according to an explicit product policy.

Do not cache `BucketState` as an authoritative gateway-local copy. It changes on every admitted request. The Redis-compatible store is the shared source of truth for a region, while its key TTL removes inactive buckets after enough time to refill. TTL jitter and request coalescing protect policy and state stores from synchronized expirations.

## 10. Database scaling and consistency

Use a durable relational or configuration-oriented store for policies, audit history, tenant plans, and operator changes. It can favor durable writes and read replicas because a policy is not mutated per request. A versioned change stream carries those changes to gateways.

Use a partitioned in-memory key-value store for bucket state. Strong atomicity is required per bucket operation, not across every bucket in every region. A single Redis Lua script gives serial execution for its keys; an equivalent compare-and-set design must retry on version conflict and must not return allow until its conditional write succeeds. Cross-region replication is asynchronous unless the product accepts global synchronous latency, so quotas should ordinarily be regional or explicitly allocated by region.

## 11. Handle concurrency

Token bucket is the main algorithm: it stores `tokens` and `lastRefillAt`, adds `elapsed * refillRate` up to `capacity`, then consumes the request cost if enough tokens remain. Refill happens during the atomic decision; no per-bucket background timer is needed.

The atomic operation must use a monotonic or store-authoritative time source, clamp negative elapsed time to zero, and refresh the bucket expiry. Passing an untrusted client timestamp would let callers manufacture tokens. For multi-key policies, the script checks all keys before decrementing any, so a rejected request does not partially consume one dimension.

Fairness is a policy choice, not an accident: evaluate tenant and principal buckets together, avoid allowing a single noisy user to consume all tenant capacity, and apply weighted costs or reserved capacity only when the product can explain them. Per-IP limits need care because shared NATs can group legitimate users; combine IP with authenticated identity rather than treating IP as a universal identity.

## 12. Reliability and failure handling

Replicate the state store across failure domains, use short client timeouts, bounded retries only for operations whose outcome is known not to have been applied, and circuit-break unhealthy shards. Blindly retrying after a timeout can double-consume a token or double-count telemetry, so a gateway needs an idempotent operation identity or a conservative no-retry rule.

Classify endpoint risk before an outage. Fail closed for security- or cost-sensitive actions such as login attempts, password resets, payment writes, and assumed expensive compute. Fail open, usually with a local emergency cap and an alert, for low-risk public reads where availability is more valuable than perfect quota accuracy. The fallback is explicit policy behavior, never a hidden blanket default.

If policy delivery fails, keep the last known version for its bounded staleness interval, then apply the endpoint's emergency policy. If the state store remains unhealthy, open the circuit to protect gateway threads and surface a controlled response or risk-appropriate fallback.

## 13. Availability versus consistency trade-offs

For a bucket in one region, favor consistency: an allowed response means the atomic shared state reserved that allowance. This prevents distributed gateways from overselling the last token.

Across regions, choose deliberately. Region-local quotas give low latency and high availability but let a principal use each region's allocation. A globally exact quota requires synchronously coordinated state or a preallocated global token budget, increasing latency and reducing availability. Fail-open improves availability during limiter loss but can overload protected systems; fail-closed preserves protection at the cost of rejecting legitimate traffic.

## 14. Security

Authenticate API keys and user identities before trusting them as keys, validate forwarded client-IP headers only from trusted proxies, and normalize route groups so attackers cannot bypass a policy with alternate paths or encodings. Keep policy-management APIs separately authorized and fully audited.

Protect the limiter itself with network isolation, TLS, credential rotation, least-privilege state-store access, and request-size limits. Avoid exposing another tenant's plan in response headers. Rate-limit policy changes and administrative probes too, and detect key rotation or credential-stuffing patterns through denial telemetry.

## 15. Monitoring and observability

Monitor decision latency, timeouts, state-store command latency, shard CPU and memory, policy-cache hit rate, policy-version lag, circuit state, and error/fallback counts. Segment allow and deny rates by route group, tenant tier, identity type, region, and endpoint risk so an operator can distinguish a legitimate burst from an attack or a bad rollout.

Track top hot keys with privacy-safe hashing, fairness outcomes such as one principal exhausting a tenant bucket, `429` and `Retry-After` distribution, and the difference between configured policy and observed consumption. Use sampled traces with a request ID and policy version, not raw secrets or personal data.

## 16. Discuss trade-offs

| Algorithm | Strength | Cost or weakness | Good fit |
|---|---|---|---|
| Token bucket | O(1), sustained rate with controlled bursts | Does not smooth every burst | Default API enforcement choice |
| Leaky bucket | Smooth downstream flow | Queues or delays bursts | Traffic shaping and work dispatch |
| Fixed window | Small and simple counter | Boundary burst can exceed the intended rolling rate | Coarse, low-risk quotas |
| Sliding window | Accurate rolling-window limit | More state and work per request | Small, high-risk limits |

Token bucket is the main choice because it supports bursts up to capacity while holding the long-term refill rate. A leaky bucket is better when smooth departure matters more than immediate acceptance. Fixed windows are cheap but have boundary artifacts. A sliding-window log is more exact but has O(requests in window) storage; a weighted sliding counter trades some precision for lower state.

Centralized regional atomic state is simpler and exact per key, but adds a network hop and makes hot keys visible. Gateway-local limits are faster and more available, but cannot enforce a shared quota without over-admitting. The correct answer makes that trade-off explicit rather than calling every counter “distributed.”

## 17. Future improvements

Add adaptive policies based on verified abuse signals, signed quota leases for a controlled regional fallback, customer-visible usage dashboards, dry-run mode for a new policy, and safe policy simulation against sampled traffic. Add dedicated tenant partitions or purchased reserved capacity when a small number of tenants dominate load.

For globally exact quotas, investigate token allocation leases with explicit reconciliation and bounded overshoot, or accept the latency of a globally coordinated authority for only the few endpoints that truly need it. Extend the policy language to support concurrency limits, bandwidth budgets, and request-cost models while retaining one atomic decision boundary.

## Interview recap

The interview answer is: “keep policy configuration separate from mutable bucket state, use token buckets for burst-tolerant sustained limits, and make every distributed consumption decision atomic so only one gateway can take the last token.”

Likely follow-ups:

- How would you enforce one globally exact quota without turning every request into a cross-region round trip?
- Which endpoints should fail closed when the limiter cannot reach shared state, and why?
- How would you prevent one enterprise tenant from creating a hot shard while still preserving a meaningful tenant-wide limit?

For a longer implementation-oriented walkthrough, see the existing [backend rate-limiter deep dive](../../../backend/system-design/design-a-rate-limiter.md).
