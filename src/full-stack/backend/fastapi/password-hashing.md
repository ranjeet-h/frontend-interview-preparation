# Password Hashing in FastAPI

## Detailed explanation

Password hashing stores one-way password hashes using bcrypt, argon2, or passlib, never plaintext. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Hash passwords before storage.

## 2. Problem it solves

It keeps FastAPI applications predictable by making contracts, shared logic, validation, or runtime behavior explicit instead of scattering framework code across handlers.

## 3. Core idea

- Use Python type hints as API contracts.
- Keep route handlers thin and delegate business logic to services.
- Use dependencies for shared request-time behavior.
- Return explicit response models and status codes.
- Test behavior through HTTP calls and dependency overrides.

## 4. Visual / analogy

```txt
Request -> dependency resolution -> validation -> endpoint -> service/database -> response model -> response
```

## 5. Minimal example

```python
from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

class Item(BaseModel):
    name: str

@app.post("/items")
def create_item(item: Item):
    return {"data": item}
```

## 6. Real-world example

A production FastAPI service uses routers per domain, Pydantic schemas for input/output, dependencies for auth and DB sessions, exception handlers for consistent errors, and tests with dependency overrides.

## 7. Common interview questions

#### Why must passwords be hashed before storage?
- **The Engine Mechanism (Why it behaves this way):** Password hashing converts plaintext passwords into irreversible hash values using algorithms like bcrypt or argon2. When a user registers, their password is hashed and the hash is stored. When they login, the provided password is hashed and compared to the stored hash. Hashing is one-way — you can't derive the original password from the hash. If the database is breached, attackers get hashes, not plaintext passwords. Salting (adding random data before hashing) prevents rainbow table attacks.
- **The Unforgettable Mental Model:** The **Meat Grinder**. The password goes in one end, comes out as ground meat (hash) on the other. You can't reconstruct the original steak from the ground meat. Each grind adds unique seasoning (salt) so even identical steaks produce different ground meat.
- **The Trap:** Using fast hash functions like MD5 or SHA256 for passwords. These are designed for speed, which helps attackers brute-force. Use slow, purpose-built password hashing algorithms (bcrypt, argon2).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Passwords must be hashed with purpose-built algorithms like bcrypt or argon2. These are intentionally slow to resist brute-force attacks. Each password gets a unique salt to prevent rainbow table attacks. I never store plaintext passwords or use fast hash functions like SHA256."

#### How do you hash passwords in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use `passlib` with `bcrypt`: `from passlib.context import CryptContext; pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto"); hashed = pwd_context.hash("plaintext_password"); is_valid = pwd_context.verify("plaintext_password", hashed)`. `hash()` generates a salted bcrypt hash. `verify()` compares a plaintext password against a stored hash. bcrypt automatically handles salt generation and embedding. The hash string contains the algorithm, cost factor, salt, and hash — all needed for verification.
- **The Unforgettable Mental Model:** The **Safe Combination**. Hashing creates a unique safe combination (hash) from your password. Verification tries the combination — if it opens the safe (matches), the password is correct. The combination includes the safe model (algorithm), difficulty (cost), and the actual code (hash).
- **The Trap**: Not using `deprecated="auto"` in CryptContext. This prevents warnings about outdated algorithms and ensures automatic migration to newer schemes when available.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use passlib with bcrypt for password hashing. pwd_context.hash() creates a salted bcrypt hash. pwd_context.verify() compares plaintext against the stored hash. bcrypt handles salt generation automatically. I set deprecated='auto' for automatic algorithm migration."

#### What is a salt and why is it important?
- **The Engine Mechanism (Why it behaves this way):** A salt is random data added to the password before hashing. Each password gets a unique salt, so even identical passwords produce different hashes. This prevents: (1) **Rainbow table attacks** — precomputed hash tables are useless because each hash uses a different salt, (2) **Identical password detection** — attackers can't tell if two users have the same password. bcrypt automatically generates and embeds the salt in the hash string. The salt is not secret — it's stored alongside the hash.
- **The Unforgettable Mental Model:** The **Unique Fingerprint**. Two identical twins (same password) look the same, but with different fingerprints (salts), they're distinguishable. The fingerprint isn't secret — it's just unique.
- **The Trap**: Using a global salt (same salt for all passwords). This defeats the purpose — identical passwords still produce identical hashes. Each password needs its own unique salt.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A salt is random data added to each password before hashing. It ensures identical passwords produce different hashes, preventing rainbow table attacks and identical password detection. bcrypt generates unique salts automatically and embeds them in the hash string."

#### What algorithm should you use for password hashing?
- **The Engine Mechanism (Why it behaves this way):** Recommended algorithms: **bcrypt** — widely used, well-tested, configurable cost factor, good default choice. **argon2** — winner of the Password Hashing Competition, more resistant to GPU attacks, recommended for new projects. **scrypt** — memory-hard, good alternative. Avoid: MD5, SHA1, SHA256 (too fast, not designed for passwords). The cost factor (work factor) determines how slow the hash is — higher is more secure but slower. Balance security with user experience (login latency).
- **The Unforgettable Mental Model:** The **Safe Lock**. A cheap lock (MD5) opens instantly — easy for thieves. A high-security safe (argon2) takes time to open — legitimate users wait a moment, but thieves are deterred by the time cost.
- **The Trap**: Setting the cost factor too high. A cost factor that takes 5 seconds per hash makes login painfully slow and enables DoS attacks. Aim for 200-500ms per hash.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use bcrypt as the default — it's well-tested and widely supported. For new projects, I consider argon2, which won the Password Hashing Competition. I set the cost factor so hashing takes 200-500ms — secure enough to resist brute-force but fast enough for good user experience."

#### How do you handle password migration?
- **The Engine Mechanism (Why it behaves this way):** When upgrading from a weaker algorithm (e.g., MD5) to a stronger one (bcrypt), use passlib's multi-scheme support: `CryptContext(schemes=["bcrypt", "md5_crypt"], deprecated="auto")`. During login, verify against the old scheme. If successful, re-hash with the new scheme and update the database. Passlib's `deprecated="auto"` flag marks old hashes for migration. Over time, all passwords migrate to the new scheme as users log in.
- **The Unforgettable Mental Model:** The **Road Repaving**. Cars (logins) still use the old road (old hash) while the new road (new hash) is being built. Each car that passes gets redirected to the new road. Eventually, all traffic uses the new road.
- **The Trap**: Forcing all users to reset passwords during migration. This creates friction and support tickets. Gradual migration during login is seamless.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use passlib's multi-scheme support for gradual migration. During login, I verify against the old scheme, then re-hash with the new scheme and update the database. Users migrate seamlessly as they log in — no forced password resets needed."

#### How do you test password hashing?
- **The Engine Mechanism (Why it behaves this way):** Test that hashing produces different hashes for the same password (salt uniqueness): `hash1 = pwd_context.hash("password"); hash2 = pwd_context.hash("password"); assert hash1 != hash2`. Test verification: `assert pwd_context.verify("password", hash1)`. Test wrong password: `assert not pwd_context.verify("wrong", hash1)`. Test that hashes don't contain the plaintext password. For performance tests, measure hashing time and ensure it's within the target range (200-500ms).
- **The Unforgettable Mental Model:** The **Quality Control**. Test that each product (hash) is unique even from the same mold (password), that the correct key (password) opens it, and that wrong keys don't.
- **The Trap**: Testing with real bcrypt in every test run. bcrypt is intentionally slow — testing it hundreds of times makes tests slow. Use a faster scheme for tests or mock the hashing.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test hash uniqueness (same password produces different hashes), verification correctness, and wrong password rejection. For performance, I measure hashing time. To keep tests fast, I use a faster scheme in test config or mock the hashing for non-security tests."

## 8. Active recall test

1. **Why hash passwords instead of storing plaintext?**
   - **Explanation:** If the database is breached, attackers get hashes, not plaintext. Hashing is one-way — you can't derive the original password from the hash.

2. **Which algorithm should you use for password hashing?**
   - **Explanation:** bcrypt (well-tested default) or argon2 (newer, more resistant to GPU attacks). Never use MD5, SHA1, or SHA256 — they're too fast.

3. **What is a salt?**
   - **Explanation:** Random data added to each password before hashing. Ensures identical passwords produce different hashes, preventing rainbow table attacks.

4. **How do you hash and verify passwords in FastAPI?**
   - **Explanation:** Use passlib with bcrypt: pwd_context.hash() for hashing, pwd_context.verify() for verification. bcrypt handles salt generation automatically.

5. **How do you handle password algorithm migration?**
   - **Explanation:** Use passlib's multi-scheme support with deprecated="auto". Verify against old scheme during login, re-hash with new scheme, update database.

6. **What cost factor should you use?**
   - **Explanation:** Set it so hashing takes 200-500ms — secure enough to resist brute-force but fast enough for good user experience. Too high enables DoS.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Password Hashing in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Password Hashing in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Password Hashing in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
