# How do you store passwords securely

## Detailed explanation

How do you store passwords securely is a core backend security topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you store passwords securely by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply backend security rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you store passwords securely affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you store passwords securely?
- **The Engine Mechanism (Why it behaves this way):** Passwords are stored as hashes using slow, salted hashing algorithms (bcrypt, Argon2, scrypt). On registration, the password is hashed with a unique random salt and the hash is stored. On login, the submitted password is hashed with the stored salt and compared to the stored hash using constant-time comparison. Passwords are never stored in plaintext, reversible encryption, or fast hashes (MD5, SHA256).
- **The Unforgettable Mental Model:** The **Industrial Shredder + Fingerprint**. The password goes through an industrial shredder (slow hash) that can't be reversed. Each shredding uses a unique fingerprint (salt) so identical passwords produce different shredded results. The shredded result is stored — the original password can never be recovered.
- **The Trap**: Storing passwords in reversible encryption. If the encryption key is compromised, all passwords are exposed. Hashing is one-way — even with database access, passwords can't be recovered.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store passwords as hashes using bcrypt or Argon2 — slow, salted hashing algorithms designed for password storage. On registration, I hash the password with a unique random salt. On login, I use the algorithm's constant-time compare function. Passwords are never stored in plaintext, reversible encryption, or fast hashes like MD5 or SHA256. The slow hashing makes brute-force attacks computationally infeasible, and unique salts prevent rainbow table attacks."

#### Why use slow hashing algorithms for passwords?
- **The Engine Mechanism (Why it behaves this way):** Slow hashing algorithms (bcrypt, Argon2) are intentionally computationally expensive, taking 200-500ms per hash. This makes brute-force attacks impractical — an attacker can only test a few passwords per second per GPU, instead of billions per second with fast hashes like SHA256. The slowness is a feature, not a bug — it's the primary defense against brute-force and GPU-accelerated attacks.
- **The Unforgettable Mental Model:** The **Speed Bump**. Fast hashes are like a smooth road — attackers can drive through at full speed (billions of guesses per second). Slow hashes are like speed bumps — each guess takes significant time, making the attack impractical.
- **The Trap**: Setting the cost factor too low. A low cost factor makes hashing fast, which benefits attackers more than legitimate users (who only hash once per login).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Slow hashing algorithms are intentionally expensive — 200-500ms per hash. This makes brute-force attacks impractical because attackers can only test a few passwords per second instead of billions. The slowness is the primary defense against GPU-accelerated attacks. I configure the cost factor to target 200-500ms on production hardware, balancing security against login performance. Fast hashes like SHA256 are designed for speed, which makes them terrible for password storage."

#### How do you handle password hash migration?
- **The Engine Mechanism (Why it behaves this way):** When upgrading algorithms or increasing cost factors, use rehash-on-login: verify the password against the old hash, and if valid, rehash with the new algorithm/cost and update the database. This migrates active users transparently without forcing password resets. Track the algorithm type from the hash prefix ($2b$ for bcrypt, $argon2id$ for Argon2) — no separate database column needed.
- **The Unforgettable Mental Model:** The **Road Repaving**. Instead of closing the highway (forcing password resets), you repave one lane at a time as cars drive over it (rehash on login). Eventually, the entire road is repaved without disrupting traffic.
- **The Trap**: Forcing all users to reset passwords when upgrading. This creates poor UX and reduces trust. Rehash-on-login is transparent and gradual.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I handle password hash migration through rehash-on-login. When a user logs in, I verify against the stored hash. If the hash uses an outdated algorithm or cost factor, I rehash with the new settings and update the database. This migrates active users transparently. I detect the algorithm from the hash prefix — $2b$ for bcrypt, $argon2id$ for Argon2 — so no separate database column is needed. For inactive users, I can set a deadline after which they must reset their password."

#### What would you monitor for password storage?
- **The Engine Mechanism (Why it behaves this way):** Monitor: hashing algorithm distribution (% using bcrypt vs Argon2 vs legacy), hashing latency (p50, p95, p99), cost factor configuration (verify it hasn't been lowered), rehash rates (migration progress), and database breach detection (passwords appearing in breach databases). Alert on cost factor changes and legacy algorithm usage.
- **The Unforgettable Mental Model:** The **Password Storage Health Monitor**. You're watching which algorithms are in use (distribution), how long hashing takes (latency), whether the cost factor is correct, and how fast migration is progressing (rehash rates).
- **The Trap**: Not monitoring cost factor configuration. A deployment error could accidentally lower the cost factor, weakening password security without obvious symptoms.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor password storage through hashing algorithm distribution, hashing latency percentiles, cost factor configuration verification, rehash rates for migration progress, and database breach detection. Cost factor monitoring is critical — a deployment error that lowers the cost factor weakens security silently. I also monitor for legacy algorithm usage (MD5, SHA1) and alert on any passwords still stored with weak hashes."

## 8. Active recall test

1. **How do you store passwords securely?**
   - **Explanation:** Hash with slow, salted algorithms (bcrypt, Argon2). Never store plaintext, reversible encryption, or fast hashes (MD5, SHA256). Use constant-time comparison for verification.
2. **Why use slow hashing algorithms?**
   - **Explanation:** They're intentionally expensive (200-500ms), making brute-force attacks impractical. Attackers can only test a few passwords per second instead of billions with fast hashes.
3. **What algorithms should you use?**
   - **Explanation:** bcrypt, Argon2 (preferably Argon2id), or scrypt. These are slow, salted, and designed specifically for password storage.
4. **How do you migrate password hashes?**
   - **Explanation:** Rehash-on-login — verify against old hash, if valid rehash with new algorithm/cost and update database. Detect algorithm from hash prefix. Transparent and gradual.
5. **What is the target hashing latency?**
   - **Explanation:** 200-500ms on production hardware. Balance security (higher = slower for attackers) against login performance (lower = faster for users).
6. **Why never store passwords in reversible encryption?**
   - **Explanation:** If the encryption key is compromised, all passwords are exposed. Hashing is one-way — even with database access, passwords can't be recovered.
7. **What should you monitor for password storage?**
   - **Explanation:** Algorithm distribution, hashing latency, cost factor configuration, rehash rates, and legacy algorithm usage. Alert on cost factor changes and weak hashes.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you store passwords securely in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you store passwords securely in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
