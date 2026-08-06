# Refresh Tokens in FastAPI

## Detailed explanation

Refresh tokens issue new access tokens while supporting rotation, revocation, and replay defense. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Refresh tokens keep sessions alive safely.

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

#### What are refresh tokens and why use them?
- **The Engine Mechanism (Why it behaves this way):** Refresh tokens are long-lived tokens used to obtain new short-lived access tokens without re-authenticating. When an access token expires, the client sends the refresh token to a `/refresh` endpoint. The server validates the refresh token, creates a new access token, and returns it. Refresh tokens are stored server-side (database) to support revocation and rotation. This balances security (short access tokens limit exposure) with user experience (infrequent re-authentication).
- **The Unforgettable Mental Model:** The **Hotel Key Card System**. The room key (access token) expires daily. The key card (refresh token) lasts your entire stay. When the room key expires, you use the key card at the front desk to get a new room key — no need to re-check in.
- **The Trap:** Storing refresh tokens in JWT format without server-side tracking. Stateless refresh tokens can't be revoked. Always store refresh tokens in the database for revocation support.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Refresh tokens are long-lived tokens that obtain new access tokens without re-authentication. Access tokens are short-lived (15-30 min) for security; refresh tokens are long-lived (7-30 days) for convenience. I store refresh tokens server-side to support revocation and rotation."

#### How do you implement a refresh token endpoint?
- **The Engine Mechanism (Why it behaves this way):** `@app.post("/refresh") def refresh(refresh_token: str = Body(...)): stored = db.query(RefreshToken).filter_by(token=refresh_token).first(); if not stored or stored.expired: raise HTTPException(401); new_access = create_access_token({"sub": stored.user_id}); return {"access_token": new_access, "token_type": "bearer"}`. The endpoint validates the refresh token against the database (checks existence, expiration, revocation status), creates a new access token, and returns it. For token rotation, generate a new refresh token and invalidate the old one.
- **The Unforgettable Mental Model:** The **Ticket Exchange**. You trade your old ticket (refresh token) for a new one (access token). The exchange desk (endpoint) verifies the old ticket is valid, issues a new one, and marks the old one as used.
- **The Trap:** Not validating the refresh token against the database. A stateless refresh token can't be revoked — if stolen, it works until expiration. Always validate against stored tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The refresh endpoint validates the refresh token against the database — checking existence, expiration, and revocation status. If valid, it creates a new access token. For rotation, it generates a new refresh token and invalidates the old one. This supports logout and compromised token revocation."

#### What is refresh token rotation?
- **The Engine Mechanism (Why it behaves this way):** Token rotation issues a new refresh token each time the old one is used. The old refresh token is invalidated (deleted or marked as used). If a stolen refresh token is used after the legitimate user has already rotated it, the server detects reuse and revokes the entire token family (all tokens derived from the original). This limits the window of attack — even if a refresh token is stolen, it becomes invalid after the next legitimate use.
- **The Unforgettable Mental Model:** The **One-Time Pad**. Each use of the refresh token generates a new one and destroys the old. If someone tries to use the old one, the system knows it's been compromised and locks everything down.
- **The Trap**: Not handling token reuse detection. If a stolen token is used concurrently with the legitimate one, both may succeed before rotation completes. Implement reuse detection to revoke the entire token family.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Token rotation issues a new refresh token each time the old one is used, invalidating the old one. If a stolen token is reused after rotation, the server detects it and revokes the entire token family. This limits the attack window — stolen tokens become useless after the next legitimate refresh."

#### How do you revoke refresh tokens?
- **The Engine Mechanism (Why it behaves this way):** Implement a `/logout` endpoint that marks the refresh token as revoked: `@app.post("/logout") def logout(refresh_token: str = Body(...), current_user: User = Depends(get_current_user)): token = db.query(RefreshToken).filter_by(token=refresh_token, user_id=current_user.id).first(); if token: token.revoked = True; db.commit(); return {"msg": "Logged out"}`. For "logout all devices," revoke all refresh tokens for the user. Revoked tokens are rejected by the refresh endpoint. Store revocation status in the database with an index for fast lookup.
- **The Unforgettable Mental Model:** The **Card Cancellation**. When you report a credit card lost, the bank cancels it (revokes the token). Even if someone finds it, it's useless. "Cancel all cards" revokes every card linked to your account.
- **The Trap**: Not revoking refresh tokens on password change. If a user's password is compromised, the attacker may have valid refresh tokens. Revoke all tokens on password change.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I implement logout by marking the refresh token as revoked in the database. For 'logout all devices,' I revoke all tokens for the user. I also revoke all tokens on password change. The refresh endpoint checks revocation status before issuing new access tokens."

#### How do you store refresh tokens securely?
- **The Engine Mechanism (Why it behaves this way):** Store refresh tokens in the database with: (1) **Hashed token value** — hash the token before storage (like passwords), so a DB breach doesn't expose usable tokens, (2) **Expiration timestamp** — tokens expire after a set period, (3) **User association** — link to the user for revocation, (4) **Device metadata** — store IP, user agent for anomaly detection, (5) **Revocation flag** — boolean for logout support. Send the raw token to the client in the response; store only the hash server-side.
- **The Unforgettable Mental Model:** The **Bank Vault**. The vault (database) stores hashed tokens (not raw), with expiration dates, owner info, and a cancellation switch (revocation). Even if the vault is breached, the hashes are useless without the original tokens.
- **The Trap**: Storing raw refresh tokens in the database. If the database is compromised, attackers get usable tokens. Always hash tokens before storage.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I store refresh tokens hashed in the database — like passwords. I include expiration, user association, device metadata, and a revocation flag. The raw token goes to the client; only the hash is stored. This protects against database breaches."

#### How do you test refresh token flows?
- **The Engine Mechanism (Why it behaves this way):** Test the full flow: login → get access + refresh tokens → use access token → access token expires → use refresh token → get new access token → use new access token. Test edge cases: expired refresh token (401), revoked refresh token (401), reused rotated token (401 + family revocation), and logout (token revoked). Test token rotation: use refresh token twice — first succeeds, second fails. Use TestClient with mocked token creation for deterministic tests.
- **The Unforgettable Mental Model:** The **Full Dress Rehearsal**. Test the entire performance: opening night (login), intermission (token refresh), encore (new access token), and emergency procedures (revocation, reuse detection).
- **The Trap**: Only testing the happy path. Test expired, revoked, and reused tokens. Each should return the appropriate error.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test the full refresh flow — login, token usage, expiration, refresh, and new token usage. I test edge cases: expired tokens, revoked tokens, reused rotated tokens, and logout. I mock token creation for deterministic tests and verify each error scenario returns the correct status code."

## 8. Active recall test

1. **What are refresh tokens?**
   - **Explanation:** Long-lived tokens used to obtain new short-lived access tokens without re-authentication. Stored server-side for revocation support.

2. **How do you implement a refresh endpoint?**
   - **Explanation:** Validate the refresh token against the database (existence, expiration, revocation), create a new access token, and return it. For rotation, generate a new refresh token.

3. **What is refresh token rotation?**
   - **Explanation:** Issues a new refresh token each time the old one is used, invalidating the old one. Detects reuse and revokes the entire token family if a stolen token is reused.

4. **How do you revoke refresh tokens?**
   - **Explanation:** Mark the token as revoked in the database. For "logout all devices," revoke all tokens for the user. Also revoke all tokens on password change.

5. **How should refresh tokens be stored?**
   - **Explanation:** Hashed in the database (like passwords), with expiration, user association, device metadata, and revocation flag. Never store raw tokens.

6. **How do you test refresh token flows?**
   - **Explanation:** Test the full flow: login → use access token → refresh → use new token. Test edge cases: expired, revoked, reused tokens. Mock token creation for determinism.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

Refresh Tokens in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain Refresh Tokens in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define Refresh Tokens in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
