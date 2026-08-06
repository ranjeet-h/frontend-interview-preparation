# How do you implement refresh token rotation

## Detailed explanation

How do you implement refresh token rotation is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you implement refresh token rotation by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you implement refresh token rotation affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement refresh token rotation?
- **The Engine Mechanism (Why it behaves this way):** On each request to the `/refresh` endpoint: (1) Extract the refresh token from the httpOnly cookie, (2) Look it up in the database and verify it's not revoked, (3) Mark the current token as used/revoked, (4) Generate a new refresh token with a new random value, (5) Store the new token in the database linked to the same user and token family, (6) Set the new token as an httpOnly cookie in the response, (7) Return a new access token. The old token is now invalid.
- **The Unforgettable Mental Model:** The **Conveyor Belt**. Each refresh token moves along a belt — when it reaches the end (used), it's removed and a fresh one is placed at the start. There's always exactly one valid token on the belt. If someone tries to grab an old one that's already fallen off, you know something is wrong.
- **The Trap:** Not atomically revoking the old token and issuing the new one. If the old token isn't revoked before the new one is issued, there's a window where both are valid, enabling replay attacks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refresh token rotation means issuing a new refresh token on every refresh request while invalidating the old one. The flow is: extract the token from the cookie, validate it in the database, atomically mark it as used and generate a new one, store the new token, set it as an httpOnly cookie, and return a new access token. The atomicity is critical — the old token must be invalidated in the same transaction as the new token is created, preventing any window where both are valid."

#### How do you handle concurrent refresh requests?
- **The Engine Mechanism (Why it behaves this way):** When multiple requests trigger refresh simultaneously (e.g., multiple API calls getting 401 at the same time), they may all try to use the same refresh token. Solutions: (1) Frontend mutex — queue concurrent requests and only send one refresh, (2) Backend reuse window — allow a brief grace period (e.g., 10 seconds) where a recently-rotated token is still accepted, (3) Token family tracking — if a rotated token is reused within the grace period, return the same new token instead of revoking the family.
- **The Unforgettable Mental Model:** The **Single-Lane Bridge**. Only one car (refresh request) can cross at a time. Other cars wait in line (queue). If two cars arrive simultaneously, a traffic controller (mutex) decides who goes first.
- **The Trap:** Treating rotated token reuse as theft without considering race conditions. Legitimate concurrent requests can cause reuse. A grace period distinguishes between race conditions and actual theft.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Concurrent refresh requests are a real challenge. On the frontend, I use a mutex to ensure only one refresh request is in flight — concurrent 401s are queued and replayed with the new token. On the backend, I implement a short reuse window (10 seconds) where a recently-rotated token is still accepted and returns the same new token. This handles race conditions without false-positive theft detection. If a rotated token is reused outside the grace period, that's when I treat it as theft and revoke the family."

#### How do you detect refresh token theft using rotation?
- **The Engine Mechanism (Why it behaves this way):** If a refresh token is stolen, both the legitimate client and the attacker will try to use it. The first to use it gets a new token; the second presents the old (now-rotated) token. If the old token is used outside the grace period, it indicates theft. The server then revokes the entire token family (all tokens descended from the same root), logs the incident, and requires re-authentication.
- **The Unforgettable Mental Model:** The **Duplicate Key Alert**. You use your key to open the door, and the system records it. If someone else uses a copy of that same key after it's been recorded as used, the alarm sounds — someone has a duplicate.
- **The Trap:** Revoking the family too aggressively. Race conditions can cause legitimate reuse. The grace period and family tracking prevent false positives while still catching actual theft.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Rotation detects theft through reuse of rotated tokens. When a client uses a refresh token, it's rotated. If that same token is used again (by an attacker who stole it), the server detects the reuse. Outside a short grace period for race conditions, reuse indicates theft. The response is to revoke the entire token family — all tokens descended from the same root — log the incident, and require re-authentication. This catches compromised refresh tokens even before they expire naturally."

#### What database schema do you need for rotation?
- **The Engine Mechanism (Why it behaves this way):** The refresh token table needs: `id` (primary key), `token_hash` (hashed token value, never store plaintext), `user_id` (foreign key), `family_id` (groups related tokens in a rotation chain), `expires_at` (expiration timestamp), `revoked_at` (null if active, timestamp if revoked), `created_at`, and `updated_at`. The `family_id` enables family-wide revocation when theft is detected.
- **The Unforgettable Mental Model:** The **Family Tree**. Each refresh token is a person in a family. The family_id is the surname. When theft is detected, you don't just remove one person — you evacuate the entire family (revoke all tokens with the same family_id).
- **The Trap:** Storing refresh tokens in plaintext. If the database is compromised, all tokens are exposed. Always hash tokens (like passwords) using a fast hash (SHA-256) since you need exact match lookup, not slow hashing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The refresh token table stores a hashed token value (never plaintext), user ID, family ID for rotation chain tracking, expiration timestamp, and revocation timestamp. The family ID is critical — it groups all tokens in a rotation chain, enabling family-wide revocation when theft is detected. I hash tokens with SHA-256 (fast hash for exact match lookup, not bcrypt) and index on token_hash for efficient lookup and on family_id for bulk revocation."

#### How do you clean up expired refresh tokens?
- **The Engine Mechanism (Why it behaves this way):** A background job (cron or scheduled task) periodically deletes expired and revoked refresh tokens from the database. The job runs at a reasonable interval (hourly or daily), deletes tokens where `expires_at < NOW()` or `revoked_at < NOW() - INTERVAL '30 days'` (keep revoked tokens briefly for audit), and logs the count of deleted tokens for monitoring.
- **The Unforgettable Mental Model:** The **Housekeeping Service**. Just like a hotel cleans rooms after guests check out, the cleanup job removes expired and revoked tokens from the database. Without it, the database fills up with useless entries.
- **The Trap:** Never cleaning up expired tokens. The refresh token table grows unbounded, degrading query performance and increasing storage costs. Cleanup is essential for production systems.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I run a scheduled cleanup job that deletes expired refresh tokens and revoked tokens older than a retention period (30 days for audit purposes). The job runs hourly or daily depending on volume. I monitor the deletion count to ensure the cleanup is working — a sudden drop might indicate the job is broken, and a sudden spike might indicate a mass revocation event. Without cleanup, the table grows unbounded and degrades performance."

#### How does rotation affect the frontend?
- **The Engine Mechanism (Why it behaves this way):** The frontend doesn't need to manage rotation explicitly — the browser automatically sends the httpOnly cookie with the refresh request, and the backend sets the new cookie in the response. The frontend only needs to handle the response: retry the original request with the new access token, or redirect to login if refresh fails. The cookie rotation is transparent to JavaScript.
- **The Unforgettable Mental Model:** The **Automatic Watch Winder**. The watch (refresh token) keeps itself wound (rotated) automatically. The wearer (frontend) just checks the time (makes API calls) without worrying about the mechanism.
- **The Trap:** Trying to read or manage the refresh token in the frontend. With httpOnly cookies, the frontend can't and shouldn't access the refresh token. Rotation is entirely handled by the backend and browser.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: With httpOnly cookies, refresh token rotation is transparent to the frontend. The browser automatically sends the cookie with refresh requests, and the backend sets the new cookie in the response. The frontend only handles the outcome: retry the original request with the new access token on success, or redirect to login on failure. The frontend never reads or manages the refresh token directly — that's the security benefit of httpOnly cookies."

#### What would you monitor for refresh token rotation?
- **The Engine Mechanism (Why it behaves this way):** Monitor: rotation success rates, rotated token reuse detections (theft indicator), token family revocation rates, refresh token table growth rate (cleanup effectiveness), and concurrent refresh request rates (race condition frequency). Alert on spikes in family revocations or table growth.
- **The Unforgettable Mental Model:** The **Rotation Dashboard**. You're watching how smoothly the conveyor belt is running (rotation success), whether anyone is grabbing old tokens (reuse detections), and whether the belt is getting too long (table growth).
- **The Trap:** Not monitoring token family revocation rates. A spike indicates either widespread token theft or a bug in the rotation logic (false-positive revocations).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor rotation health through success rates, rotated token reuse detections (theft indicator), family revocation rates, and refresh token table growth. A spike in family revocations could indicate token theft or a rotation bug. Table growth monitoring ensures the cleanup job is working. I also track concurrent refresh rates to understand race condition frequency and tune the grace period. Alerting on unusual patterns catches both security incidents and infrastructure issues."

## 8. Active recall test

1. **What is refresh token rotation?**
   - **Explanation:** Issuing a new refresh token on each refresh request while invalidating the old one. Creates a chain where each token replaces the previous one, enabling theft detection through reuse.
2. **How do you handle concurrent refresh requests?**
   - **Explanation:** Frontend mutex (queue requests, one refresh in flight) and backend grace period (allow brief reuse of recently-rotated tokens, returning the same new token).
3. **How does rotation detect token theft?**
   - **Explanation:** If a rotated (old) token is used outside the grace period, it indicates theft. The server revokes the entire token family and requires re-authentication.
4. **What is a token family?**
   - **Explanation:** A group of refresh tokens linked by a common family_id, representing all tokens in a rotation chain. Revoking the family invalidates all tokens in the chain.
5. **Should refresh tokens be stored in plaintext in the database?**
   - **Explanation:** No. Store a hash (SHA-256) of the token value. If the database is compromised, plaintext tokens would give attackers immediate access.
6. **Why must expired refresh tokens be cleaned up?**
   - **Explanation:** To prevent unbounded database growth, maintain query performance, and reduce storage costs. A scheduled job should periodically delete expired and old revoked tokens.
7. **Does the frontend need to manage refresh token rotation?**
   - **Explanation:** No. With httpOnly cookies, rotation is transparent. The browser sends the cookie automatically, and the backend sets the new one. The frontend only handles the response.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you implement refresh token rotation in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you implement refresh token rotation in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
