# JWT vs session

## Detailed explanation

JWT vs session is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand jwt vs session by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, jwt vs session affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is the difference between JWT and session-based authentication?
- **The Engine Mechanism (Why it behaves this way):** JWT (JSON Web Token) is a self-contained, cryptographically signed token that encodes claims (user ID, roles, expiration) in its payload. The server validates the signature without database lookup. Session-based auth stores state server-side and sends only a random session ID to the client. The server must look up the session data on every request.
- **The Unforgettable Mental Model:** **Driver's License vs. Hotel Key Card**. A JWT is like a driver's license — all your info is on the card itself, and anyone can verify it's real by checking the hologram (signature). A session is like a hotel key card — the card itself is just a number, and the front desk must check their system to know what room it opens.
- **The Trap:** Thinking JWT is always better because it's stateless. Statelessness is only an advantage when you actually need it (microservices, distributed systems). For a monolithic web app, sessions are simpler and offer better revocation control.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JWT is a self-contained token that encodes identity claims and is validated cryptographically without server-side state. Session authentication stores state server-side and uses a random session ID to look up that state. JWTs are stateless and great for distributed systems, but harder to revoke. Sessions require a session store but enable instant revocation and fine-grained session management. The choice depends on architecture and revocation requirements."

#### What are the three parts of a JWT?
- **The Engine Mechanism (Why it behaves this way):** A JWT has three base64url-encoded parts separated by dots: Header (algorithm and token type, e.g., `{"alg":"HS256","typ":"JWT"}`), Payload (claims like sub, exp, iat, roles), and Signature (HMAC or RSA signature of header+payload using a secret or private key). The signature ensures the token hasn't been tampered with.
- **The Unforgettable Mental Model:** The **Sealed Envelope**. The header is the return address (metadata), the payload is the letter content (claims), and the signature is the wax seal (proof it hasn't been opened or altered). Anyone can read the letter, but only someone with the right key can verify the seal.
- **The Trap:** Assuming JWT payload is encrypted. It's only base64-encoded, not encrypted. Anyone who intercepts a JWT can read its contents. Never put sensitive data (passwords, SSNs) in JWT payload.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: A JWT has three parts: the header, which specifies the signing algorithm and token type; the payload, which contains claims like user ID, roles, and expiration; and the signature, which is a cryptographic hash of the header and payload signed with a secret or private key. Importantly, the payload is base64-encoded, not encrypted — anyone can read it. The signature only ensures integrity, not confidentiality."

#### How does JWT validation work?
- **The Engine Mechanism (Why it behaves this way):** The server receives the JWT, splits it into three parts, decodes the header to determine the algorithm, recalculates the signature using the known secret/public key, and compares it with the token's signature. It then checks claims: `exp` (not expired), `iat` (issued in the past), `nbf` (not before), and `iss` (correct issuer). If any check fails, the token is rejected.
- **The Unforgettable Mental Model:** The **Notary Public**. The notary (server) checks: Is the seal genuine (signature valid)? Is the document expired (exp claim)? Was it issued by a trusted source (iss claim)? Is it being used before its valid date (nbf claim)? All checks must pass.
- **The Trap:** Not validating all claims. Checking only the signature while ignoring `exp` means expired tokens are accepted. Always validate signature, expiration, issuer, and audience.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JWT validation has two phases. First, cryptographic validation: decode the header, recalculate the signature with the known key, and compare it to the token's signature. Second, claim validation: check that the token hasn't expired (exp), was issued by a trusted issuer (iss), is intended for this audience (aud), and isn't being used before its valid date (nbf). Both phases must pass. I always use a well-tested JWT library rather than implementing validation manually."

#### What are the revocation challenges with JWT?
- **The Engine Mechanism (Why it behaves this way):** JWTs are self-contained and stateless — once issued, they're valid until expiration. There's no server-side state to delete. Revocation strategies include: short expiration times (5-15 minutes) with refresh tokens, maintaining a token blocklist (defeats statelessness), versioning tokens with a user-level version number that increments on logout, or using a token introspection endpoint.
- **The Unforgettable Mental Model:** The **Pre-Paid Gift Card**. Once issued, the card is valid until its balance is used or it expires. You can't "un-issue" it — you can only make it expire sooner or maintain a list of cancelled card numbers (which requires checking every transaction against the list).
- **The Trap:** Setting JWT expiration to days or weeks "for convenience." A stolen JWT with a 30-day expiration gives an attacker a month of access. Use short-lived access tokens (5-15 min) with refresh tokens for better security.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JWT revocation is inherently difficult because tokens are stateless — once issued, they're valid until expiration. The standard approach is short-lived access tokens (5-15 minutes) paired with refresh tokens that can be revoked server-side. For immediate revocation, you can maintain a blocklist, embed a version number in the token that's checked against a user record, or use reference tokens instead of self-contained JWTs. The choice depends on your revocation requirements."

#### How do JWT and sessions compare for security?
- **The Engine Mechanism (Why it behaves this way):** JWT security depends on: signing key protection (compromised key = all tokens forgeable), short expiration, secure storage (httpOnly cookies), and proper claim validation. Session security depends on: session ID randomness (predictable IDs = session hijacking), session store protection, cookie flags (httpOnly, secure, sameSite), and session fixation prevention.
- **The Unforgettable Mental Model:** **Vault vs. Safe Deposit Box**. JWT is like a vault — if someone gets the combination (signing key), everything is compromised. Sessions are like safe deposit boxes — each box (session) is independent, and compromising one doesn't compromise others.
- **The Trap:** Using `alg: none` in JWT header. Some libraries historically accepted unsigned tokens when the header specified no algorithm, allowing anyone to forge tokens. Always reject `alg: none`.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Both approaches are secure when implemented correctly, but they have different failure modes. JWT's biggest risk is signing key compromise — if the key leaks, all tokens can be forged. Sessions' biggest risk is session store compromise or predictable session IDs. For storage, both should use httpOnly, secure, sameSite cookies. JWT needs short expiration and refresh token rotation; sessions need session regeneration on login and proper cleanup. I choose based on architecture needs, not perceived security superiority."

#### How does the choice affect API design?
- **The Engine Mechanism (Why it behaves this way):** JWT APIs are stateless — any endpoint can validate tokens independently, enabling simpler microservice communication. Session APIs require either sticky sessions or a shared session store, adding infrastructure dependencies. JWT enables B2B token exchange (OAuth); sessions are typically limited to single-application scope.
- **The Unforgettable Mental Model:** **Universal vs. Local Currency**. JWT is like US dollars — accepted anywhere that recognizes it. Sessions are like store credit — only valid at the issuing store (or stores sharing the same session database).
- **The Trap:** Over-engineering with JWT for a simple monolith. If you have one backend and one frontend, sessions are simpler and offer better revocation. Don't choose JWT just because it's trendy.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JWT enables stateless API design where any service can validate tokens independently, which simplifies microservice communication and enables token-based federation. Sessions require shared infrastructure, which adds complexity in distributed systems but is trivial in monoliths. I don't default to JWT — for a single backend serving a web frontend, sessions are simpler and more secure. I choose JWT when the architecture genuinely benefits from stateless validation: microservices, mobile backends, or third-party integrations."

#### What would you monitor for JWT vs session systems?
- **The Engine Mechanism (Why it behaves this way):** For JWT: token validation failure rates (signature failures, expired tokens), token issuance rates, refresh token rotation success/failure, signing key rotation status. For sessions: session store latency and hit rates, session count and memory usage, session expiration rate, session fixation attempt detection.
- **The Unforgettable Mental Model:** The **Health Monitor**. JWT monitoring focuses on the token lifecycle — issuance, validation, refresh, and key health. Session monitoring focuses on the session store — capacity, latency, and session lifecycle.
- **The Trap:** Not monitoring JWT signing key rotation. If keys aren't rotated on schedule, the risk of compromise increases over time. If rotation fails, all token validation breaks.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: For JWT, I monitor token validation failures by type (signature mismatch, expired, invalid issuer), refresh token rotation success rates, and signing key health including rotation status. For sessions, I monitor the session store's latency, memory usage, hit rates, and session lifecycle metrics. Both need authentication latency percentiles and failure rate alerts. The key difference is that JWT monitoring is token-lifecycle focused while session monitoring is infrastructure-focused."

## 8. Active recall test

1. **What are the three parts of a JWT?**
   - **Explanation:** Header (algorithm and token type), Payload (claims like sub, exp, roles), and Signature (cryptographic hash of header+payload). Separated by dots and base64url-encoded.
2. **Is the JWT payload encrypted?**
   - **Explanation:** No. It's base64-encoded, not encrypted. Anyone can decode and read the payload. Never store sensitive data in JWT claims.
3. **Why is JWT revocation difficult?**
   - **Explanation:** JWTs are stateless and self-contained. Once issued, they're valid until expiration with no server-side state to delete. Revocation requires workarounds like blocklists, short expiration with refresh tokens, or versioning.
4. **What claims should you always validate in a JWT?**
   - **Explanation:** Signature (integrity), exp (expiration), iat (issued at — not in the future), iss (issuer — trusted source), and aud (audience — intended for this service).
5. **What is the risk of a compromised JWT signing key?**
   - **Explanation:** An attacker can forge any JWT with any claims, impersonating any user with any permissions. All tokens signed with that key become untrustworthy until the key is rotated.
6. **When should you choose JWT over sessions?**
   - **Explanation:** When you need stateless validation (microservices), cross-service authentication, mobile app support, or third-party token exchange (OAuth). Not for simple monolithic web apps.
7. **What is the recommended JWT access token expiration?**
   - **Explanation:** 5-15 minutes. Short-lived access tokens limit the window of exploitation if a token is stolen. Longer-lived access is achieved through refresh token rotation.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain JWT vs session in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define JWT vs session in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
