# What is token revocation

## Detailed explanation

What is token revocation is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is token revocation by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply auth rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, what is token revocation affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is token revocation?
- **The Engine Mechanism (Why it behaves this way):** Token revocation is the process of invalidating a previously-issued token before its natural expiration. For refresh tokens (stored server-side), revocation means marking the token as revoked in the database. For JWT access tokens (stateless), revocation requires a blocklist, token versioning, or reference tokens. Revocation is checked during token validation — if a token is revoked, it's rejected even if its signature is valid and it hasn't expired.
- **The Unforgettable Mental Model:** The **Cancelled Credit Card**. The card (token) hasn't expired yet, but the bank (server) has cancelled it. Even though the card looks valid, any transaction (API request) is declined because the bank checks its cancellation list.
- **The Trap:** Assuming JWTs can't be revoked. While JWTs are stateless by design, revocation is possible through blocklists, versioning, or by using reference tokens instead of self-contained JWTs.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Token revocation is the process of invalidating a token before its natural expiration. For refresh tokens stored server-side, it's straightforward — mark the token as revoked in the database. For stateless JWT access tokens, it requires additional mechanisms like a blocklist of revoked token IDs, token versioning, or reference tokens. Revocation is essential for security — it enables logout, password change invalidation, and response to compromised credentials."

#### Why is token revocation important?
- **The Engine Mechanism (Why it behaves this way):** Without revocation, stolen tokens remain valid until expiration. If an access token has a 15-minute expiration and is stolen at minute 1, the attacker has 14 minutes of access. If a refresh token has a 30-day expiration and is stolen, the attacker has 30 days. Revocation immediately cuts off access, regardless of remaining token lifetime.
- **The Unforgettable Mental Model:** The **Emergency Stop Button**. Revocation is the e-stop that immediately halts access. Without it, you have to wait for the machine (token) to run out of fuel (expire) on its own.
- **The Trap:** Relying solely on short expiration instead of revocation. Short expiration reduces the window but doesn't eliminate it. Revocation provides immediate response to security incidents.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Token revocation is critical because it provides immediate response to security incidents. Without it, stolen tokens are valid until expiration — which could be minutes for access tokens or weeks for refresh tokens. Revocation enables immediate logout, invalidates sessions after password changes, and cuts off access when credentials are compromised. It's a fundamental security control that every auth system needs."

#### How do you revoke refresh tokens?
- **The Engine Mechanism (Why it behaves this way):** Refresh tokens are stored server-side, so revocation is a database operation: (1) Find the token by its hash in the refresh_tokens table, (2) Set `revoked_at` to the current timestamp, (3) Optionally revoke the entire token family (all tokens with the same family_id) if theft is detected. On subsequent validation, the server checks `revoked_at` and rejects revoked tokens.
- **The Unforgettable Mental Model:** The **Library Book Recall**. The book (token) is still in the borrower's possession, but the library (database) has marked it as recalled. When the borrower tries to renew it, the system rejects the request.
- **The Trap:** Soft-deleting tokens instead of marking them as revoked. Soft deletes can be accidentally restored or missed by validation queries. An explicit `revoked_at` column is clearer and safer.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refresh token revocation is a database operation since refresh tokens are stored server-side. I set a `revoked_at` timestamp on the token record, and validation checks this field before accepting the token. For theft detection, I revoke the entire token family — all tokens sharing the same family_id. I use an explicit revoked_at column rather than soft deletes for clarity and to ensure validation queries correctly reject revoked tokens."

#### How do you revoke JWT access tokens?
- **The Engine Mechanism (Why it behaves this way):** JWTs are stateless, so revocation requires stateful mechanisms: (1) Blocklist — store revoked JWT IDs (jti) in Redis with TTL matching token expiration, (2) Versioning — embed a version number in the JWT, store the current version in the user record, and reject tokens with old versions, (3) Reference tokens — instead of self-contained JWTs, use opaque tokens that require server-side lookup (like sessions). The blocklist is most common for immediate revocation.
- **The Unforgettable Mental Model:** The **Wanted Poster**. The JWT itself is valid (correct signature, not expired), but there's a wanted poster (blocklist) that says "this specific token is no longer trusted." Validators check the poster before accepting.
- **The Trap:** Creating an unbounded blocklist. Blocklist entries should have a TTL matching the token's remaining expiration — once the token expires naturally, the blocklist entry is no longer needed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JWT revocation requires adding state to a stateless system. The most common approach is a Redis blocklist of revoked token IDs (jti) with TTL matching the token's remaining expiration. This keeps the blocklist bounded — entries expire when the tokens would have expired anyway. For user-level revocation (logout all devices), I use token versioning — embed a version in the JWT and increment it on the user record. Both approaches add a database/Redis lookup to validation, trading some statelessness for revocation capability."

#### When should you revoke tokens?
- **The Engine Mechanism (Why it behaves this way):** Tokens should be revoked on: (1) User-initiated logout, (2) Password change (invalidate all existing sessions), (3) Suspicious activity detection (unusual IP, device, or behavior), (4) Account suspension or deletion, (5) Refresh token rotation reuse detection (theft), (6) Admin-initiated session termination, (7) Security incident response (known credential breach).
- **The Unforgettable Mental Model:** The **Security Protocol Checklist**. Each event on the list triggers a specific revocation action: logout revokes current session, password change revokes all sessions, suspicious activity revokes the affected session, etc.
- **The Trap:** Not revoking tokens on password change. If a user changes their password because they suspect compromise, existing tokens remain valid unless explicitly revoked.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I revoke tokens on logout (current session), password change (all sessions), suspicious activity (affected sessions), account suspension (all sessions), refresh token theft detection (token family), and security incidents (all affected tokens). Password change revocation is especially important — if a user changes their password due to suspected compromise, all existing sessions must be invalidated. I also provide users with a 'logout from all devices' feature for proactive session management."

#### How does revocation affect system performance?
- **The Engine Mechanism (Why it behaves this way):** Revocation adds a lookup to token validation: for refresh tokens, a database query; for JWT blocklists, a Redis lookup. This adds latency to every authenticated request. Mitigations: use fast in-memory stores (Redis), cache validation results briefly, and batch blocklist checks. The performance impact is typically minimal (sub-millisecond for Redis) but must be monitored.
- **The Unforgettable Mental Model:** The **Toll Booth**. Every car (request) must stop at the toll booth (revocation check) before proceeding. A fast toll booth (Redis) adds barely a second; a slow one (database) causes traffic jams.
- **The Trap:** Using a slow database for JWT blocklist lookups on every request. Redis or Memcached is essential for low-latency blocklist checks at scale.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Revocation adds a lookup to token validation — a database query for refresh tokens or a Redis lookup for JWT blocklists. I use Redis for blocklist checks because it's sub-millisecond, and I monitor the added latency. For high-throughput systems, I can cache validation results briefly (a few seconds) to reduce lookup frequency. The performance impact is typically negligible with Redis, but it's important to monitor and scale the Redis cluster as traffic grows."

#### What would you monitor for token revocation?
- **The Engine Mechanism (Why it behaves this way):** Monitor: revocation rates by type (logout, password change, theft detection), blocklist size and growth rate, revocation-to-validation latency, post-revocation token usage attempts (indicates propagation delay or caching issues), and family revocation rates. Alert on unusual revocation spikes or post-revocation usage.
- **The Unforgettable Mental Model:** The **Revocation Control Panel**. You're watching how many tokens are being cancelled (revocation rates), how big the cancellation list is (blocklist size), and whether cancelled tokens are still being used (post-revocation attempts).
- **The Trap:** Not monitoring post-revocation token usage. If revoked tokens are still being accepted, it indicates a propagation delay, caching issue, or bug in the validation logic.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor revocation health through revocation rates by type, blocklist size and growth, validation latency impact, and post-revocation token usage attempts. Post-revocation usage is the most critical signal — if revoked tokens are still being accepted, something is wrong with the revocation propagation. I also alert on unusual revocation spikes, which could indicate a security incident or a bug causing false-positive revocations."

## 8. Active recall test

1. **What is token revocation?**
   - **Explanation:** Invalidating a previously-issued token before its natural expiration. Essential for logout, password changes, and responding to compromised credentials.
2. **How do you revoke a refresh token?**
   - **Explanation:** Mark it as revoked in the database by setting a `revoked_at` timestamp. Validation checks this field and rejects revoked tokens.
3. **How do you revoke a JWT access token?**
   - **Explanation:** Use a Redis blocklist of revoked token IDs (jti) with TTL matching token expiration, or token versioning (embed version in JWT, check against user record).
4. **When should tokens be revoked?**
   - **Explanation:** On logout, password change, suspicious activity, account suspension, refresh token theft detection, admin session termination, and security incidents.
5. **Why is password change revocation important?**
   - **Explanation:** If a user changes their password due to suspected compromise, existing tokens remain valid unless revoked. Revoking all sessions ensures the attacker loses access.
6. **How does revocation affect performance?**
   - **Explanation:** Adds a lookup (database or Redis) to every token validation. Mitigated by using fast in-memory stores (Redis) and brief caching. Typically sub-millisecond impact.
7. **What does post-revocation token usage indicate?**
   - **Explanation:** Revoked tokens still being accepted indicates propagation delay, caching issues, or bugs in validation logic. It's a critical monitoring signal.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is token revocation in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is token revocation in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
