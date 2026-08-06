# How do you handle password hashing

## Detailed explanation

How do you handle password hashing is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you handle password hashing by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you handle password hashing affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you hash passwords securely?
- **The Engine Mechanism (Why it behaves this way):** Use a slow, salted hashing algorithm designed for passwords: bcrypt, Argon2, or scrypt. These algorithms are intentionally computationally expensive, making brute-force attacks impractical. The process: generate a random salt, combine it with the password, run it through the hashing algorithm with a configured cost factor (work factor), and store the resulting hash (which includes the salt and algorithm parameters). On login, extract the salt and parameters from the stored hash, run the submitted password through the same algorithm, and compare the results using constant-time comparison.
- **The Unforgettable Mental Model:** The **Industrial Shredder**. A regular hash (SHA256) is like a paper shredder — fast but reversible with enough effort. A password hash (bcrypt) is like an industrial shredder mixed with a furnace — it takes time to process, and the result is irrecoverable. The slowness is the feature, not the bug.
- **The Trap:** Using fast hashing algorithms (MD5, SHA256, SHA512) for passwords. These are designed for speed, which makes them vulnerable to brute-force and GPU-accelerated attacks. Password hashing must be slow.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I hash passwords using bcrypt or Argon2 — algorithms specifically designed for password storage. They're intentionally slow, with a configurable cost factor that determines computational effort. On registration, I hash the password with a random salt and store the result. On login, I use the algorithm's compare function, which extracts the salt and parameters from the stored hash and performs constant-time comparison. I never use fast hashes like MD5 or SHA256 for passwords, and I never store plaintext passwords."

#### What is a cost factor and how do you choose it?
- **The Engine Mechanism (Why it behaves this way):** The cost factor (work factor, rounds) determines how many iterations the hashing algorithm performs. Higher cost = more secure but slower. For bcrypt, the cost factor is exponential: cost 10 = 2^10 = 1024 iterations. The target is ~200-500ms per hash on your production hardware. Start with cost 10-12 and benchmark on your actual server. Increase the cost as hardware improves.
- **The Unforgettable Mental Model:** The **Combination Lock Dial**. More dial positions (higher cost) means more combinations to try, making it harder to crack. But it also takes longer for the legitimate user to dial in their combination. You balance security against convenience.
- **The Trap:** Setting the cost factor too high, causing login timeouts under load. If each hash takes 2 seconds and you have 100 concurrent logins, that's 200 seconds of total hashing time. Benchmark on production hardware.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The cost factor controls how computationally expensive the hash is. For bcrypt, it's exponential — each increment doubles the work. I choose the cost factor by benchmarking on production hardware, targeting 200-500ms per hash. I start at cost 10-12 and adjust based on server performance. The cost should be high enough to resist brute-force but low enough to handle concurrent logins without timeout. I also plan to increase the cost over time as hardware improves and rehash passwords on login when the cost changes."

#### How do you handle password hash migration?
- **The Engine Mechanism (Why it behaves this way):** When upgrading hashing algorithms (e.g., bcrypt to Argon2) or increasing cost factors, use a rehash-on-login strategy: (1) On login, verify the password against the old hash, (2) If valid and the hash uses an outdated algorithm/cost, rehash the password with the new algorithm/cost, (3) Update the stored hash in the database, (4) Continue the login flow. This gradually migrates all active users without forcing password resets.
- **The Unforgettable Mental Model:** The **Road Repaving**. Instead of closing the entire highway (forcing password resets), you repave one lane at a time as cars (users) drive over it (log in). Eventually, the entire road is repaved without disrupting traffic.
- **The Trap:** Forcing all users to reset passwords when upgrading the hashing algorithm. This creates a poor user experience and reduces trust. Rehash-on-login is transparent and gradual.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle hash migration through rehash-on-login. When a user logs in, I verify their password against the stored hash. If the hash uses an outdated algorithm or cost factor, I rehash the password with the new settings and update the database. This migrates active users transparently without forcing password resets. For inactive users, I can trigger a rehash requirement on their next login or after a grace period. This approach is used by major platforms and provides a smooth migration path."

#### How do you verify a password against a stored hash?
- **The Engine Mechanism (Why it behaves this way):** Use the hashing library's built-in compare function (e.g., `bcrypt.compare(plainText, storedHash)`). This function extracts the salt, algorithm, and cost factor from the stored hash, applies them to the submitted password, and performs constant-time comparison. Never implement comparison manually — the library handles timing-attack resistance and parameter extraction.
- **The Unforgettable Mental Model:** The **Lock and Key**. The stored hash is the lock (it contains the mechanism details — salt, algorithm, cost). The submitted password is the key. The compare function is the locksmith who tries the key in the lock and tells you if it fits, without revealing how the lock works.
- **The Trap:** Implementing manual string comparison (`hash === storedHash`). Standard string comparison exits early on mismatch, leaking timing information. Always use the library's constant-time compare function.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I always use the hashing library's built-in compare function, like `bcrypt.compare(plainText, storedHash)`. This function extracts the salt and parameters from the stored hash, applies them to the submitted password, and performs constant-time comparison. I never implement comparison manually because standard string comparison is vulnerable to timing attacks — it exits early on mismatch, allowing attackers to guess the hash character by character. The library handles all of this correctly."

#### What happens if the database of password hashes is leaked?
- **The Engine Mechanism (Why it behaves this way):** If password hashes are leaked, the damage depends on the hashing algorithm: weak hashes (MD5, SHA1) can be cracked quickly using rainbow tables or GPU brute-force. Strong hashes (bcrypt, Argon2) with proper cost factors resist cracking for years. Response: force password resets for all affected users, notify users of the breach, investigate the leak source, and ensure the hashing algorithm and cost factor are adequate.
- **The Unforgettable Mental Model:** The **Safe Combination Book**. If the combinations are written in pencil (weak hash), anyone can erase and read them. If they're carved in steel with a complex cipher (strong hash), they're practically unreadable even with the book.
- **The Trap:** Not having an incident response plan for hash leaks. Know in advance how you'll force password resets, notify users, and communicate the breach. Preparation reduces response time and damage.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: If password hashes are leaked, the impact depends on the hashing algorithm. With bcrypt or Argon2 at proper cost factors, cracking is computationally infeasible for strong passwords. My response plan is: force password resets for all affected users, notify users transparently, investigate the breach source, and audit the hashing configuration. I also ensure that even if hashes are leaked, the slow hashing algorithm makes cracking impractical. This is why choosing the right algorithm and cost factor is a critical security decision."

#### How does password hashing affect login performance?
- **The Engine Mechanism (Why it behaves this way):** Password hashing is the most expensive operation in the login flow. A bcrypt hash at cost 12 takes ~250ms. Under concurrent load, this can become a bottleneck. Mitigations: use async/non-blocking hashing (Node.js worker threads), scale horizontally, use a dedicated auth service, and consider adaptive cost factors that adjust based on server load.
- **The Unforgettable Mental Model:** The **Toll Bridge**. Every login must cross the toll bridge (hashing). If the bridge is narrow (single-threaded hashing), traffic backs up. Widen the bridge (worker threads, horizontal scaling) to handle more traffic.
- **The Trap:** Blocking the event loop with synchronous hashing in Node.js. `bcrypt.hashSync()` blocks the entire event loop, making the server unresponsive during hashing. Always use async versions.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Password hashing is the most expensive part of login — bcrypt at cost 12 takes ~250ms. In Node.js, I always use async hashing (`bcrypt.hash()` not `hashSync()`) to avoid blocking the event loop. For high-throughput systems, I scale horizontally or use a dedicated auth service. I also monitor hashing latency and adjust the cost factor based on server capacity. The key is balancing security (higher cost) with performance (lower latency) — and never blocking the event loop."

#### What would you monitor for password hashing?
- **The Engine Mechanism (Why it behaves this way):** Monitor: hashing latency (p50, p95, p99), hashing error rates, cost factor configuration (ensure it hasn't been accidentally lowered), hash algorithm distribution (% using bcrypt vs legacy algorithms), and rehash rates (how many passwords are being migrated). Alert on latency spikes or cost factor changes.
- **The Unforgettable Mental Model:** The **Hashing Factory Monitor**. You're watching how long each hash takes (latency), whether any are failing (errors), and whether the factory is upgrading its equipment (algorithm migration).
- **The Trap:** Not monitoring the cost factor configuration. A deployment error could accidentally lower the cost factor, weakening password security without anyone noticing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor password hashing through latency percentiles (p50, p95, p99), error rates, cost factor configuration verification, and hash algorithm distribution. I alert on latency spikes (indicating infrastructure issues), cost factor changes (indicating misconfiguration), and track rehash rates to monitor migration progress. Cost factor monitoring is especially important — a deployment error that lowers the cost factor weakens security silently, so I verify it on every deployment."

## 8. Active recall test

1. **Which algorithms should you use for password hashing?**
   - **Explanation:** bcrypt, Argon2, or scrypt. These are slow, salted hashing algorithms designed specifically for passwords. Never use MD5, SHA1, or SHA256.
2. **What is a cost factor?**
   - **Explanation:** A parameter that controls how computationally expensive the hash is. For bcrypt, it's exponential (cost 10 = 2^10 iterations). Higher cost = more secure but slower.
3. **How do you choose the right cost factor?**
   - **Explanation:** Benchmark on production hardware, targeting 200-500ms per hash. Start at cost 10-12 and adjust based on server performance and concurrent login capacity.
4. **How do you migrate to a new hashing algorithm?**
   - **Explanation:** Rehash-on-login: verify against old hash, if valid and outdated, rehash with new algorithm and update the database. Gradual and transparent to users.
5. **Why must you use constant-time comparison for password verification?**
   - **Explanation:** Standard string comparison exits early on mismatch, leaking timing information. Attackers can use timing differences to guess the hash character by character.
6. **What happens if password hashes are leaked?**
   - **Explanation:** With strong hashing (bcrypt/Argon2), cracking is computationally infeasible for strong passwords. Response: force password resets, notify users, investigate the breach.
7. **Why should you use async hashing in Node.js?**
   - **Explanation:** Synchronous hashing blocks the event loop, making the server unresponsive during hashing. Async hashing (`bcrypt.hash()`) allows the server to handle other requests while hashing.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you handle password hashing in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you handle password hashing in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
