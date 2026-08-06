# bcrypt vs argon2

## Detailed explanation

bcrypt vs argon2 is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand bcrypt vs argon2 by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, bcrypt vs argon2 affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is the difference between bcrypt and Argon2?
- **The Engine Mechanism (Why it behaves this way):** bcrypt (1999) uses the Blowfish cipher with a configurable cost factor for CPU-hard hashing. Argon2 (2015, Password Hashing Competition winner) adds memory-hardness — it requires significant RAM to compute, making GPU and ASIC attacks much more expensive. Argon2 has three variants: Argon2d (data-dependent, fastest), Argon2i (data-independent, side-channel resistant), and Argon2id (hybrid, recommended for passwords). Both are salted and slow by design.
- **The Unforgettable Mental Model:** **Weightlifting vs. Obstacle Course**. bcrypt is like lifting heavier weights (more CPU cycles = harder). Argon2 is like an obstacle course that requires both strength AND a large playing field (CPU + RAM). The obstacle course is harder to automate because you need both resources.
- **The Trap:** Assuming bcrypt is "good enough" without considering modern attack vectors. bcrypt is still secure, but Argon2's memory-hardness provides better protection against GPU/ASIC attacks, which have become significantly more powerful since bcrypt was designed.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Both bcrypt and Argon2 are password hashing algorithms designed to be slow and salted. bcrypt uses CPU-hard computation with a configurable cost factor. Argon2, the 2015 Password Hashing Competition winner, adds memory-hardness — it requires significant RAM, making GPU and ASIC attacks much more expensive. Argon2id is the recommended variant for passwords. bcrypt is still secure and widely used, but Argon2 provides better protection against modern hardware-accelerated attacks."

#### When would you choose bcrypt over Argon2?
- **The Engine Mechanism (Why it behaves this way):** Choose bcrypt when: (1) Your platform/language has mature bcrypt libraries but limited Argon2 support, (2) You're maintaining an existing system that already uses bcrypt (migration cost outweighs benefits), (3) Your infrastructure has memory constraints (Argon2 requires more RAM per hash), (4) Your team is more familiar with bcrypt's configuration and tuning. bcrypt is battle-tested with decades of production use.
- **The Unforgettable Mental Model:** The **Reliable Pickup Truck**. bcrypt is the old pickup — it's been around forever, everyone knows how to fix it, parts are everywhere, and it gets the job done. Argon2 is the new electric truck — better in many ways, but the charging infrastructure (library support) isn't everywhere yet.
- **The Trap:** Migrating from bcrypt to Argon2 without a clear plan. The migration requires rehash-on-login, and the security improvement may not justify the operational complexity for low-risk applications.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd choose bcrypt when the platform has mature bcrypt support but limited Argon2 libraries, when maintaining an existing bcrypt-based system, or when infrastructure has memory constraints. bcrypt is battle-tested with decades of production use and is still considered secure. The security improvement from Argon2 is real but incremental — for most applications, properly configured bcrypt is sufficient. I'd choose Argon2 for new systems, especially those handling sensitive data or facing sophisticated threat models."

#### When would you choose Argon2 over bcrypt?
- **The Engine Mechanism (Why it behaves this way):** Choose Argon2 when: (1) Building a new system (no legacy migration needed), (2) Handling sensitive data (financial, healthcare, government), (3) Facing sophisticated threat models (state-level actors, well-funded attackers), (4) Wanting the best available protection against GPU/ASIC attacks, (5) Compliance requirements recommend or require modern algorithms. Argon2id is the recommended variant.
- **The Unforgettable Mental Model:** The **Modern Vault**. Argon2 is the latest-generation safe — it requires both a combination (CPU) AND a large physical space (RAM) to crack. Even with the best tools, attackers need both resources, making it significantly harder than a combination-only lock.
- **The Trap:** Using Argon2d for password hashing. Argon2d is vulnerable to side-channel attacks. Always use Argon2id, which combines the side-channel resistance of Argon2i with the GPU resistance of Argon2d.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I'd choose Argon2 for new systems, especially those handling sensitive data or facing sophisticated threats. Argon2's memory-hardness makes GPU and ASIC attacks significantly more expensive than against bcrypt. I always use Argon2id — the hybrid variant that combines side-channel resistance with GPU resistance. Argon2 is the Password Hashing Competition winner and represents the current state of the art in password hashing."

#### How do you configure Argon2 for password hashing?
- **The Engine Mechanism (Why it behaves this way):** Argon2 has three key parameters: `memoryCost` (RAM in KB, e.g., 65536 = 64MB), `timeCost` (iterations, e.g., 3), and `parallelism` (threads, e.g., 4). The target is ~200-500ms per hash on production hardware. Start with OWASP recommendations: memoryCost 65536 (64MB), timeCost 3, parallelism 4. Benchmark and adjust based on your server's capacity.
- **The Unforgettable Mental Model:** The **Recipe Settings**. Memory is how much counter space you need, time is how many times you stir, and parallelism is how many cooks help. More of each makes the dish better (more secure) but takes more resources.
- **The Trap:** Setting memoryCost too high for your server. If each hash requires 64MB and you have 100 concurrent logins, that's 6.4GB of RAM just for hashing. Benchmark with realistic concurrent load.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Argon2 has three parameters: memory cost (RAM in KB), time cost (iterations), and parallelism (threads). I start with OWASP recommendations — 64MB memory, 3 iterations, 4 parallel threads — and benchmark on production hardware targeting 200-500ms per hash. I adjust based on server capacity, being careful that memory cost multiplied by concurrent logins doesn't exceed available RAM. I always use Argon2id and monitor hashing latency in production."

#### How do bcrypt and Argon2 compare against GPU attacks?
- **The Engine Mechanism (Why it behaves this way):** bcrypt is CPU-hard but not memory-hard, so GPUs can parallelize bcrypt hashing efficiently (GPUs have thousands of cores). Argon2 is memory-hard, requiring significant RAM per hash attempt. GPUs have limited memory per core, making Argon2 much slower on GPU hardware. This makes Argon2 significantly more resistant to GPU-accelerated brute-force attacks.
- **The Unforgettable Mental Model:** **Sprinters vs. Marathon Runners**. bcrypt is like a sprint — GPUs have thousands of sprinters (cores) and can run many bcrypt hashes in parallel. Argon2 is like a marathon that requires each runner to carry a heavy backpack (RAM). GPUs can't equip all their sprinters with backpacks, so they can't parallelize effectively.
- **The Trap:** Underestimating GPU attack capabilities. Modern GPU clusters can test billions of bcrypt hashes per second. A weak password hashed with bcrypt can be cracked in hours, not years.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: bcrypt is CPU-hard but not memory-hard, so GPUs can parallelize it efficiently with their thousands of cores. Argon2's memory-hardness requires significant RAM per hash attempt, which GPUs can't provide at scale. This makes Argon2 significantly more resistant to GPU attacks. A modern GPU cluster can test billions of bcrypt hashes per second, but Argon2 reduces that by orders of magnitude. For high-security applications, Argon2's GPU resistance is a meaningful advantage."

#### How do you migrate from bcrypt to Argon2?
- **The Engine Mechanism (Why it behaves this way):** Use rehash-on-login: (1) On login, check if the stored hash is bcrypt or Argon2, (2) If bcrypt, verify the password with bcrypt, (3) If valid, rehash the password with Argon2 and update the database, (4) Continue the login flow. Track the algorithm type in the hash itself (both bcrypt and Argon2 encode their algorithm in the hash string), so no separate database column is needed.
- **The Unforgettable Mental Model:** The **Currency Exchange**. You're gradually converting from one currency (bcrypt) to another (Argon2). Each time someone makes a transaction (logs in), their money is converted. Eventually, everyone is using the new currency.
- **The Trap:** Not detecting the algorithm type correctly. Both bcrypt and Argon2 encode their algorithm in the hash prefix (`$2b$` for bcrypt, `$argon2id$` for Argon2). Use this prefix to detect the algorithm rather than a separate database column.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I migrate from bcrypt to Argon2 using rehash-on-login. On login, I detect the algorithm from the hash prefix — `$2b$` for bcrypt, `$argon2id$` for Argon2. If it's bcrypt, I verify with bcrypt, then rehash with Argon2 and update the database. This migrates active users transparently. For inactive users, I can set a deadline after which they must reset their password. The algorithm detection from hash prefix means no database schema changes are needed."

#### What would you monitor for password hashing algorithms?
- **The Engine Mechanism (Why it behaves this way):** Monitor: hashing latency by algorithm (bcrypt vs Argon2), algorithm distribution (% of users on each algorithm), migration rate (how fast users are being migrated), memory usage (Argon2's memory cost × concurrent logins), and error rates (library compatibility issues). Alert on latency spikes or memory exhaustion.
- **The Unforgettable Mental Model:** The **Algorithm Migration Dashboard**. You're watching how many users have moved to the new algorithm (distribution), how fast the migration is happening (rate), and whether the new algorithm is performing well (latency, memory).
- **The Trap:** Not monitoring memory usage during Argon2 migration. Argon2's memory cost multiplied by concurrent logins can exhaust server RAM if not properly sized.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor hashing latency by algorithm, algorithm distribution to track migration progress, migration rate, and memory usage (especially for Argon2). During migration, I watch for memory exhaustion as Argon2's memory cost multiplied by concurrent logins can strain servers. I also monitor error rates for library compatibility issues. Alerting on latency spikes catches configuration problems, and tracking distribution shows how quickly the migration is progressing."

## 8. Active recall test

1. **What is the key difference between bcrypt and Argon2?**
   - **Explanation:** bcrypt is CPU-hard (expensive computation). Argon2 is memory-hard (requires significant RAM), making it more resistant to GPU and ASIC attacks.
2. **Which Argon2 variant should you use for passwords?**
   - **Explanation:** Argon2id. It combines the side-channel resistance of Argon2i with the GPU resistance of Argon2d, providing the best overall security for password hashing.
3. **What are Argon2's three configuration parameters?**
   - **Explanation:** memoryCost (RAM in KB), timeCost (iterations), and parallelism (threads). Target ~200-500ms per hash on production hardware.
4. **Why is Argon2 more resistant to GPU attacks than bcrypt?**
   - **Explanation:** Argon2 requires significant RAM per hash attempt. GPUs have limited memory per core, so they can't parallelize Argon2 effectively. bcrypt only requires CPU, which GPUs have in abundance.
5. **How do you detect which algorithm a stored hash uses?**
   - **Explanation:** From the hash prefix: `$2b$` for bcrypt, `$argon2id$` for Argon2. The algorithm is encoded in the hash string itself.
6. **When should you choose bcrypt over Argon2?**
   - **Explanation:** When maintaining an existing bcrypt system, when platform support for Argon2 is limited, or when infrastructure has memory constraints. bcrypt is still secure.
7. **What is the OWASP recommended starting configuration for Argon2?**
   - **Explanation:** memoryCost 65536 (64MB), timeCost 3, parallelism 4. Benchmark on production hardware and adjust based on server capacity and concurrent login load.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain bcrypt vs argon2 in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define bcrypt vs argon2 in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
