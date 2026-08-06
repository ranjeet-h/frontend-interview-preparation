# How do you hash passwords

## Detailed explanation

How do you hash passwords is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you hash passwords by linking what it is, why it exists, and how it fails in production.

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
Work   -> apply Express.js rule
Output -> success or structured error
```

## 6. Real-world example

In a production full-stack app, how do you hash passwords affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you hash passwords in Express?
- **The Engine Mechanism (Why it behaves this way):** Use bcrypt or argon2 — never plain text, MD5, or SHA-256. Bcrypt applies a salted, computationally expensive hash: `const hashedPassword = await bcrypt.hash(plainPassword, 12)`. The `12` is the cost factor (2^12 iterations). To verify: `const isValid = await bcrypt.compare(plainPassword, hashedPassword)`. Bcrypt automatically generates a random salt and embeds it in the hash output, so you don't manage salts separately. Store only the hash in the database — never the plain password. Argon2 is the modern alternative, winner of the Password Hashing Competition, and is preferred for new projects.
- **The Unforgettable Mental Model:** The **Industrial Shredder**. Plain text password goes in, comes out as unrecognizable confetti (hash). The shredder uses a unique blade pattern (salt) each time, and takes deliberately long (cost factor) to make mass-shredding attacks impractical.
- **The Trap:** Using fast hashing algorithms like MD5 or SHA-256 for passwords. They're designed for speed, which makes them vulnerable to brute-force and rainbow table attacks. Password hashing must be deliberately slow.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use bcrypt or argon2 for password hashing. Bcrypt automatically generates a salt and applies a computationally expensive hash with a configurable cost factor. I store only the hash in the database — never the plain password. On login, I use bcrypt.compare() to verify the password against the stored hash. I set the cost factor to 12 or higher, balancing security with acceptable login latency. For new projects, I prefer argon2 as it's more resistant to GPU-based attacks."

#### Why can't you use regular hash functions like SHA-256 for passwords?
- **The Engine Mechanism (Why it behaves this way):** SHA-256 is designed to be fast — millions of hashes per second on modern hardware. This makes brute-force attacks trivial: an attacker can hash billions of candidate passwords per second using GPUs. Bcrypt and argon2 are deliberately slow (hundreds of milliseconds per hash) and memory-hard, making GPU attacks impractical. Additionally, SHA-256 without a salt is vulnerable to rainbow table attacks — precomputed hash tables that reverse common passwords. Bcrypt auto-salts, making rainbow tables useless.
- **The Unforgettable Mental Model:** The **Speed Difference**. SHA-256 is a sports car — fast and efficient, perfect for data integrity checks. Bcrypt is a tank — slow and heavy, perfect for stopping attackers who need to process millions of guesses.
- **The Trap:** Thinking "I'll add a salt to SHA-256 and it'll be secure." A salt prevents rainbow tables but doesn't slow down brute-force. You need both salting AND computational slowness.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: SHA-256 is too fast — attackers can compute billions of hashes per second with GPUs, making brute-force trivial. Password-specific algorithms like bcrypt and argon2 are deliberately slow and memory-hard, making GPU attacks impractical. SHA-256 also needs manual salting, while bcrypt auto-salts. The key insight is that password hashing needs to be slow by design — what's a feature for data integrity (speed) is a vulnerability for password storage."

#### What is a salt and why is it important?
- **The Engine Mechanism (Why it behaves this way):** A salt is a random string added to the password before hashing. It ensures that two users with the same password get different hashes. Without salt, `hash('password123')` always produces the same output, enabling rainbow table attacks. Bcrypt generates a cryptographically random 16-byte salt for each hash and embeds it in the output: `$2b$12$<22-char-salt><31-char-hash>`. When verifying, bcrypt extracts the salt from the stored hash and uses it to hash the input password, producing the same result for comparison.
- **The Unforgettable Mental Model:** The **Unique Recipe**. Two chefs (users) making the same dish (password) add different secret spices (salts). The final dishes (hashes) taste completely different, even though the base recipe is the same.
- **The Trap:** Using a global salt (same salt for all passwords). This is better than no salt but still vulnerable to targeted rainbow tables. Each password needs its own unique, random salt.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A salt is random data added to each password before hashing, ensuring identical passwords produce different hashes. This defeats rainbow table attacks. Bcrypt handles salting automatically — it generates a unique random salt per password and embeds it in the hash output. When verifying, it extracts the salt and re-hashes the input. I never manage salts manually; I let bcrypt handle it."

#### What cost factor should you use with bcrypt?
- **The Engine Mechanism (Why it behaves this way):** The cost factor (work factor) determines how many iterations bcrypt performs: 2^cost. Cost 10 = 1024 iterations, cost 12 = 4096 iterations. Higher cost = more secure but slower. OWASP recommends a cost that makes hashing take 200-500ms. On modern hardware, cost 12 typically takes ~250ms. Test on your production hardware: `console.time(); await bcrypt.hash('test', 12); console.timeEnd()`. Adjust based on your server's CPU and acceptable login latency. Cloud servers may need lower costs than dedicated hardware.
- **The Unforgettable Mental Model:** The **Dial on the Safe**. Turn it up (higher cost) and it takes longer to open (more secure), but legitimate users also wait longer. Turn it down (lower cost) and it's faster but easier to crack. Find the sweet spot.
- **The Trap:** Using the default cost (10) without testing. Defaults may be too weak for modern GPUs or too slow for your server. Always benchmark on your actual production hardware.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I benchmark bcrypt on production hardware to find a cost factor that takes 200-500ms per hash. On modern servers, cost 12 is typically around 250ms. I test with console.time() during deployment setup and adjust based on the server's CPU. The goal is to make brute-force attacks impractical while keeping login latency acceptable. I also monitor login times in production and adjust if server capacity changes."

#### How do you handle password reset securely?
- **The Engine Mechanism (Why it behaves this way):** Secure password reset flow: (1) User requests reset with email. (2) Server generates a cryptographically random token: `crypto.randomBytes(32).toString('hex')`. (3) Store token hash and expiry (1 hour) in the database. (4) Send reset link with the raw token: `https://app.com/reset?token=abc123`. (5) User clicks link, enters new password. (6) Server verifies token hash and expiry, hashes new password with bcrypt, updates user record, deletes reset token. Never email the new password. Never reuse reset tokens. Use single-use tokens with short expiry.
- **The Unforgettable Mental Model:** The **One-Time Padlock**. The reset token is a padlock that opens once and then self-destructs. It has an expiration timer, and even if someone intercepts it, they have a narrow window to use it.
- **The Trap:** Sending the new password via email (email is not secure). Using predictable reset tokens (sequential IDs). Not expiring reset tokens. Allowing reset tokens to be reused.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I generate a cryptographically random reset token, store its hash with a 1-hour expiry, and email a reset link. When the user submits a new password, I verify the token, hash the new password with bcrypt, update the user, and delete the token. Tokens are single-use, short-lived, and stored as hashes (not plain text). I never email passwords, never use predictable tokens, and always invalidate tokens after use."

## 8. Active recall test

1. **Which algorithm should you use for password hashing?**
   - **Explanation:** bcrypt or argon2. Both are deliberately slow, memory-hard, and auto-salt. Argon2 is the modern preference (Password Hashing Competition winner). Never use MD5, SHA-256, or plain text.

2. **What does bcrypt.hash() do automatically?**
   - **Explanation:** Generates a cryptographically random salt, applies the hash with the specified cost factor (2^cost iterations), and embeds the salt in the output string. No manual salt management needed.

3. **How do you verify a password against a bcrypt hash?**
   - **Explanation:** `await bcrypt.compare(plainPassword, hashedPassword)`. Bcrypt extracts the salt from the stored hash, hashes the input password with that salt, and compares the results.

4. **Why is SHA-256 unsuitable for password storage?**
   - **Explanation:** It's too fast — GPUs can compute billions of hashes per second, making brute-force attacks trivial. Password hashing needs to be deliberately slow to resist brute-force.

5. **What is the recommended bcrypt cost factor?**
   - **Explanation:** Whatever makes hashing take 200-500ms on your production hardware. Typically cost 12 on modern servers. Benchmark with console.time() and adjust based on server capacity.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you hash passwords in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you hash passwords in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
