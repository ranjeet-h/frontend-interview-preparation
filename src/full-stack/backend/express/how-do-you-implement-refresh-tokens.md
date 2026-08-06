# How do you implement refresh tokens

## Detailed explanation

How do you implement refresh tokens is a core Express.js topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand how do you implement refresh tokens by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, how do you implement refresh tokens affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### How do you implement refresh tokens in Express?
- **The Engine Mechanism (Why it behaves this way):** Refresh tokens solve the problem of short-lived access tokens. Flow: (1) **Login** — server generates both an access token (15 min) and a refresh token (7 days). Access token goes to the client for API calls. Refresh token is stored securely (httpOnly cookie or secure storage). (2) **Access token expires** — client gets 401, calls `/auth/refresh` with the refresh token. (3) **Refresh endpoint** — server verifies the refresh token, checks it against the database (not revoked), generates a new access token (and optionally a new refresh token), and returns it. (4) **Logout** — server adds the refresh token to a revocation list or deletes it from the database.
- **The Unforgettable Mental Model:** The **Hotel Key Card**. The access token is your room key (expires at checkout). The refresh token is your reservation confirmation (lasts longer). When your room key stops working, you show the reservation to get a new key. When you check out (logout), the reservation is cancelled.
- **The Trap:** Storing refresh tokens in localStorage — XSS attacks can steal them. Use httpOnly cookies or secure storage. Also, not implementing token rotation — if a refresh token is stolen, the attacker can keep generating new access tokens forever.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement refresh tokens as a separate token pair with longer expiration. On login, I generate both an access token (15 min) and a refresh token (7 days). The refresh token is stored in an httpOnly cookie for XSS protection. When the access token expires, the frontend calls /auth/refresh with the cookie. The backend verifies the refresh token, checks it's not revoked in the database, and issues a new access token. I also implement token rotation — each refresh generates a new refresh token, invalidating the old one."

#### Why do you need both access and refresh tokens?
- **The Engine Mechanism (Why it behaves this way):** Access tokens are short-lived to limit the damage if stolen — they expire quickly and can't be revoked (JWTs are stateless). But requiring users to re-login every 15 minutes is terrible UX. Refresh tokens bridge this gap: they're long-lived but stored more securely and can be revoked server-side (stored in a database). If an access token is stolen, it's only useful for 15 minutes. If a refresh token is stolen, it can be revoked by deleting it from the database or rotating it.
- **The Unforgettable Mental Model:** The **Two-Key System**. The access token is a disposable keycard (changes frequently, low risk if lost). The refresh token is a master key (longer-lasting, more protected, can be deactivated). Losing the disposable keycard is minor; losing the master key is serious but manageable.
- **The Trap:** Using only long-lived access tokens for convenience. If stolen, they're valid until expiration with no revocation mechanism. The two-token system balances security and UX.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Access tokens are short-lived because JWTs are stateless and can't be revoked — if stolen, they're valid until expiration. Refresh tokens are long-lived but stored securely and can be revoked server-side. The combination gives us short security windows (access tokens) with good UX (automatic refresh via refresh tokens). If either token is compromised, the damage is limited and manageable."

#### How do you implement token rotation?
- **The Engine Mechanism (Why it behaves this way):** Token rotation means each refresh generates a new refresh token, invalidating the old one. Flow: (1) Store refresh token hash in database with user ID and expiry. (2) On refresh, verify the token, look up its hash in the database. (3) If found and not expired, generate new access token AND new refresh token. (4) Delete the old refresh token from the database, save the new one's hash. (5) Return new access token and set new refresh token cookie. If the old token is used again (replay attack), detect it and revoke all tokens for that user.
- **The Unforgettable Mental Model:** The **One-Time Password**. Each use generates a new code and invalidates the old one. If someone tries to use the old code, you know something is wrong and lock the account.
- **The Trap:** Not handling race conditions — if the client makes two simultaneous refresh requests, the second one uses the old (now invalid) refresh token. Handle this by allowing a short grace period for the previous token.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Token rotation generates a new refresh token on each refresh, invalidating the old one. I store the refresh token hash in the database, and on each refresh, I verify the token, generate a new pair, delete the old hash, and save the new one. If an old token is reused (replay attack), I detect it and revoke all tokens for that user, forcing re-authentication. I also handle race conditions by allowing a brief grace period for the previous token."

#### How do you revoke refresh tokens?
- **The Engine Mechanism (Why it behaves this way):** Revocation strategies: (1) **Database storage** — store each refresh token (or its hash) in a database with user ID and expiry. To revoke, delete the record. On refresh, check if the token exists in the database. (2) **Blocklist** — maintain a Redis blocklist of revoked tokens with TTL matching the token's remaining expiry. (3) **Version field** — store a tokenVersion number on the user record. Include it in the JWT payload. To revoke all tokens, increment the version — all old tokens become invalid because their version doesn't match. Database storage is the most common approach for MERN apps.
- **The Unforgettable Mental Model:** The **Blacklist**. Instead of checking every guest's invitation at the door (stateless JWT), you keep a list of cancelled invitations (revoked tokens). If someone's invitation is on the blacklist, they don't get in.
- **The Trap:** Trying to revoke JWT access tokens directly — you can't, because they're stateless. You can only revoke refresh tokens (which are stored) and wait for access tokens to expire naturally.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store refresh tokens in the database with their hash, user ID, and expiry. To revoke, I delete the record. On refresh, I verify the token exists in the database. For access tokens, I can't revoke them directly since they're stateless JWTs — I just wait for them to expire. For emergency revocation of all tokens, I use a tokenVersion field on the user record that's included in the JWT payload. Incrementing it invalidates all existing tokens."

#### How do you store refresh tokens securely?
- **The Engine Mechanism (Why it behaves this way):** Best practice: httpOnly, secure, sameSite cookies. `res.cookie('refreshToken', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 7 * 24 * 60 * 60 * 1000 })`. `httpOnly` prevents JavaScript access (XSS protection). `secure` ensures HTTPS-only transmission. `sameSite` prevents CSRF attacks. Alternative: mobile apps use secure storage (Keychain on iOS, Keystore on Android). Never store refresh tokens in localStorage or sessionStorage — they're accessible to any JavaScript, including malicious scripts from XSS attacks.
- **The Unforgettable Mental Model:** The **Safe Deposit Box**. httpOnly means only the bank (browser) can access it, not you directly (no JavaScript). secure means it only travels in armored trucks (HTTPS). sameSite means it only works at the bank's own branches (same origin).
- **The Trap:** Using localStorage for refresh tokens because it's "easier." Any XSS vulnerability exposes the token. httpOnly cookies are slightly more complex to implement but provide critical XSS protection.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store refresh tokens in httpOnly, secure, sameSite cookies. httpOnly prevents JavaScript access, protecting against XSS. secure ensures HTTPS-only. sameSite prevents CSRF. The frontend doesn't need to read the token — the browser sends it automatically with requests to the refresh endpoint. For SPAs on different domains, I use sameSite: 'none' with secure: true, but prefer keeping frontend and backend on the same domain to use sameSite: 'strict'."

## 8. Active recall test

1. **What is the purpose of a refresh token?**
   - **Explanation:** To issue new access tokens without requiring the user to re-login. Access tokens are short-lived (15 min) for security; refresh tokens are long-lived (7 days) and can be revoked server-side.

2. **Where should refresh tokens be stored?**
   - **Explanation:** In httpOnly, secure, sameSite cookies. This prevents XSS attacks (httpOnly blocks JavaScript access), ensures HTTPS transmission (secure), and prevents CSRF (sameSite).

3. **What is token rotation?**
   - **Explanation:** Generating a new refresh token on each refresh, invalidating the old one. If an old token is reused, it indicates a replay attack and all tokens for that user should be revoked.

4. **Can you revoke a JWT access token?**
   - **Explanation:** Not directly — JWTs are stateless. You can only wait for them to expire. To force immediate revocation, use a tokenVersion field in the JWT payload and increment it server-side.

5. **What happens during the refresh token flow?**
   - **Explanation:** Client gets 401 from expired access token, calls /auth/refresh. Server verifies the refresh token (signature + database check), generates new access token (and optionally new refresh token), and returns it.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain How do you implement refresh tokens in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define How do you implement refresh tokens in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
