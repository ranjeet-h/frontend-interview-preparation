# Rate Limiting

## Detailed explanation

Rate limiting restricts how many requests a client can make in a time window to protect APIs from abuse and overload.

## 1. One-line mental model

Allow only a fixed amount of traffic per identity per time window.

## 2. Problem it solves

Public APIs can be abused, brute-forced, scraped, or accidentally overloaded without request limits.

## 3. Core idea

- Limit by IP, user id, API key, route, or tenant.
- Common algorithms include fixed window, sliding window, leaky bucket, and token bucket.
- Return 429 when limit is exceeded.
- Use Redis or distributed storage for multi-instance apps.
- Apply stricter limits to login and expensive endpoints.

## 4. Visual / analogy

```txt
Turnstile that allows only N people per minute.
```

## 5. Minimal example

```txt
if (tooManyRequests) return res.status(429).json({ error: "rate_limited" });
```

## 6. Real-world example

Login endpoint allows 5 failed attempts per minute per account/IP.

## 7. Common interview questions

#### What is rate limiting?
- **The Engine Mechanism (Why it behaves this way):** Rate limiting restricts how many requests a client can make within a time window to protect APIs from abuse, brute force attacks, scraping, and accidental overload. The backend tracks request counts per client identifier (IP, user ID, API key) using algorithms like fixed window (count requests per minute), sliding window (weighted count across overlapping windows), token bucket (tokens replenish at a fixed rate), or leaky bucket (requests process at a constant rate). When the limit is exceeded, the server returns HTTP 429 Too Many Requests with a `Retry-After` header. Rate limiting state is stored in Redis or a distributed store for multi-instance apps.
- **The Unforgettable Mental Model:** Rate limiting is like a **bouncer at a club** — only N people per minute can enter. If the limit is reached, you wait outside until the next window.
- **The Trap:** Rate limiting only by IP address. This blocks all users behind a shared IP (office, university, mobile carrier) when one user exceeds the limit. Combine IP with user ID or API key for fair limiting.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Rate limiting restricts how many requests a client can make in a time window to protect APIs from abuse and overload. The backend tracks request counts per client — IP, user ID, or API key — using algorithms like fixed window, sliding window, or token bucket. When the limit is exceeded, the server returns 429 with a Retry-After header. I store rate limit state in Redis for distributed apps, and I apply stricter limits to sensitive endpoints like login and password reset."

#### Why does rate limiting matter in backend systems?
- **The Engine Mechanism (Why it behaves this way):** Without rate limiting, public APIs are vulnerable to brute force attacks (trying thousands of passwords), credential stuffing (using leaked credentials), scraping (extracting all data), denial of service (overwhelming the server), and accidental overload (a buggy client sending infinite requests). Rate limiting protects server resources, prevents abuse, ensures fair usage among clients, and provides a mechanism to throttle rather than block traffic. It's a critical security and stability layer that sits at the edge of the API.
- **The Unforgettable Mental Model:** Rate limiting is like a **circuit breaker** in an electrical system. It prevents overload from causing a total system failure by limiting the flow before damage occurs.
- **The Trap:** Not rate limiting at all because "our API isn't public enough." Even internal APIs can be abused by buggy clients, and authenticated endpoints are targets for brute force attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Rate limiting matters because it protects APIs from brute force attacks, credential stuffing, scraping, denial of service, and accidental overload. It's a critical security and stability layer. I apply stricter limits to sensitive endpoints — login might allow 5 attempts per minute, while a public read endpoint allows 100 per minute. Rate limiting also ensures fair usage — one client can't consume all server resources. I implement it at the edge (reverse proxy) for infrastructure-level protection and in the app for business-level limits."

#### What bugs happen when rate limiting is handled poorly?
- **The Engine Mechanism (Why it behaves this way):** Poor rate limiting causes several issues. Rate limiting only by IP blocks all users behind a shared network (office, carrier). Not using a distributed store means each server instance tracks its own count, effectively multiplying the limit by the number of instances. Not returning `Retry-After` headers leaves clients guessing when to retry. Setting limits too low causes legitimate users to hit 429 errors during normal usage. Setting limits too high provides no protection. Not differentiating limits by endpoint means a cheap read endpoint and an expensive write endpoint share the same limit.
- **The Unforgettable Mental Model:** Poor rate limiting is like **a toll booth that counts cars per lane instead of per road**. Add more lanes (server instances), and more cars get through — the limit doesn't actually work.
- **The Trap:** Using in-memory counters for rate limiting in a multi-instance deployment. Each instance counts independently, so the effective limit is N times the configured limit.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Poor rate limiting causes legitimate users to be blocked by IP-based limits on shared networks, ineffective limits from in-memory counters in multi-instance deployments, and confused clients without Retry-After headers. The most common bug is using in-memory counters — with 6 server instances, the effective limit is 6 times what you configured. I use Redis for distributed counting, combine IP with user ID for fair limiting, return Retry-After headers, and set different limits for different endpoint types."

#### How does rate limiting affect frontend clients?
- **The Engine Mechanism (Why it behaves this way):** Frontend clients receive 429 responses when they exceed rate limits and must handle them gracefully. The `Retry-After` header tells the client how long to wait before retrying. The frontend should implement exponential backoff for retries, show user-friendly messages ("Too many attempts, please wait 30 seconds"), and disable the triggering UI element during the cooldown. Rate limit headers (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) let the frontend proactively throttle requests before hitting the limit.
- **The Unforgettable Mental Model:** Rate limiting for the frontend is like a **speed camera** — it tells you how fast you're going, how many warnings you have left, and how long to wait if you're caught speeding.
- **The Trap:** Ignoring 429 responses and retrying immediately. This creates a retry storm that keeps the client blocked and wastes server resources.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend handles 429 responses by reading the Retry-After header and waiting before retrying. I implement exponential backoff for retries, show user-friendly cooldown messages, and disable the triggering UI during the wait. I also use rate limit headers to proactively throttle requests — if X-RateLimit-Remaining is low, I slow down request frequency. The key is never retrying immediately on 429 — that creates a retry storm that keeps the client blocked."

#### How would you test rate limiting?
- **The Engine Mechanism (Why it behaves this way):** Testing rate limiting involves sending requests at and beyond the limit and verifying correct behavior. Send N requests within the window — all should succeed. Send N+1 requests — the last should return 429 with Retry-After header. Verify the counter resets after the window expires. Test with multiple client identifiers to ensure isolation. Test distributed behavior by sending requests across multiple server instances. Test that rate limit headers are present and accurate. Load test to verify rate limiting holds under concurrent requests.
- **The Unforgettable Mental Model:** Testing rate limiting is like **testing a water meter**. Turn the tap slowly (within limit) — water flows. Turn it fast (over limit) — the meter shuts off. Wait for the reset period — it works again.
- **The Trap:** Only testing from a single client. Rate limiting must correctly isolate different clients — User A hitting the limit shouldn't affect User B.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test rate limiting by sending requests at and beyond the limit. N requests should succeed, N+1 should return 429 with Retry-After. I verify the counter resets after the window. I test with multiple client IDs to ensure isolation. I test distributed behavior across server instances. I verify rate limit headers are accurate. I also load test with concurrent requests to ensure the limit holds under pressure. The key test is verifying that one client hitting the limit doesn't affect other clients."

## 8. Active recall test

1. **Explain rate limiting without looking at notes.**
   - **Explanation:** Rate limiting restricts how many requests a client can make in a time window. The backend tracks counts per client (IP, user ID, API key) using algorithms like fixed window, sliding window, or token bucket. Exceeding the limit returns 429 with Retry-After header. State is stored in Redis for distributed apps.

2. **Give one production bug related to rate limiting.**
   - **Explanation:** Using in-memory rate limit counters in a 6-instance deployment means the effective limit is 6x the configured value. An attacker can send 6x the intended requests by distributing them across instances, bypassing the rate limit entirely.

3. **Give one API example where rate limiting matters.**
   - **Explanation:** A login endpoint: `POST /auth/login` limited to 5 attempts per minute per IP. After 5 failed attempts, the 6th returns 429 with `Retry-After: 60`. This prevents brute force password attacks.

4. **Explain how a frontend client should handle rate limiting.**
   - **Explanation:** On 429, the frontend reads the Retry-After header, waits that duration, then retries with exponential backoff. It shows a user-friendly cooldown message and disables the triggering UI. It uses rate limit headers to proactively slow down when approaching the limit.

## 9. Mistakes / traps

- Giving only a textbook definition without backend context.
- Ignoring security, scaling, or client impact.
- Forgetting edge cases and failure behavior.
- Treating the concept as framework-specific when it is a backend design concept.

## 10. Compare with related concepts

Rate Limiting is related to other backend architecture topics, but it answers a specific design or runtime question. Compare it by asking: does this concept describe request intent, response meaning, infrastructure behavior, data freshness, scaling, or failure handling?

## 11. Summary from memory

Explain Rate Limiting in your own words, then give one API example and one production failure it helps prevent.

## 12. Spaced revision prompts

- Day 1: Define Rate Limiting in one sentence.
- Day 3: Give a real API example.
- Day 7: Explain one failure mode.
- Day 14: Compare it with a related backend concept.
