# JWT Auth in FastAPI

## Detailed explanation

JWT auth validates bearer tokens, extracts claims, and loads the current user through dependencies. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

JWT dependency turns token into user context.

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

#### How does JWT authentication work in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** JWT (JSON Web Token) authentication works in three steps: (1) **Login** — client sends credentials, server validates them, creates a JWT with user claims (sub, exp, roles), signs it with a secret key, and returns it, (2) **Access** — client includes the JWT in the `Authorization: Bearer <token>` header, (3) **Verification** — a FastAPI dependency extracts the token from the header, verifies the signature with the secret key, checks expiration, extracts claims, and returns the current user. The `python-jose` or `PyJWT` library handles encoding/decoding.
- **The Unforgettable Mental Model:** The **Stamped Passport**. The embassy (login endpoint) stamps your passport (JWT) with your identity and expiration date. Border control (auth dependency) checks the stamp's authenticity (signature), verifies it hasn't expired, and lets you through.
- **The Trap:** Storing sensitive data in JWT payload. JWTs are encoded, not encrypted — anyone can read the payload. Only store non-sensitive claims (user ID, roles, expiration).
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: JWT auth has three steps: login creates a signed token with user claims, the client sends it in the Authorization header, and a dependency verifies the signature, checks expiration, and extracts claims. I use python-jose for encoding/decoding. JWTs are encoded, not encrypted — I never store sensitive data in the payload."

#### How do you create a JWT token in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** Use `python-jose` to create tokens: `from jose import jwt; def create_token(data: dict, expires_delta: timedelta): to_encode = data.copy(); expire = datetime.utcnow() + expires_delta; to_encode.update({"exp": expire}); return jwt.encode(to_encode, settings.secret_key, algorithm="HS256")`. The token contains claims (sub=user ID, exp=expiration) and is signed with a secret key using HMAC-SHA256. The secret key must be kept secure — it's used to both sign and verify tokens.
- **The Unforgettable Mental Model:** The **Wax Seal**. The letter (claims) is sealed with wax (signature) using a unique stamp (secret key). Anyone can read the letter, but only someone with the same stamp can verify the seal is authentic.
- **The Trap:** Using a weak or hardcoded secret key. The secret key must be strong (32+ characters), random, and stored in environment variables. A weak key can be brute-forced.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I create JWTs with python-jose, encoding user claims and an expiration timestamp, signed with a secret key using HS256. The secret key comes from environment variables — never hardcoded. I set appropriate expiration times — short-lived access tokens, longer-lived refresh tokens."

#### How do you verify a JWT token in a dependency?
- **The Engine Mechanism (Why it behaves this way):** Create a dependency that extracts and verifies the token: `from fastapi import Depends, HTTPException; from fastapi.security import OAuth2PasswordBearer; oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token"); def get_current_user(token: str = Depends(oauth2_scheme)): try: payload = jwt.decode(token, settings.secret_key, algorithms=["HS256"]); user_id = payload.get("sub"); if user_id is None: raise HTTPException(401); return get_user_from_db(user_id); except JWTError: raise HTTPException(401)`. `OAuth2PasswordBearer` extracts the token from the `Authorization: Bearer` header. The dependency decodes, verifies, and returns the user.
- **The Unforgettable Mental Model:** The **Security Checkpoint**. The checkpoint (dependency) asks for your passport (token), verifies the stamp (signature), checks the expiration date, looks up your identity in the database, and either lets you through or denies entry.
- **The Trap:** Not catching JWTError. If the token is malformed or the signature is invalid, jwt.decode raises JWTError. Always catch it and return 401.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I use OAuth2PasswordBearer to extract the token from the Authorization header, then decode it with python-jose. I verify the signature, check expiration, and look up the user in the database. I catch JWTError and return 401. The dependency returns the current user object for the endpoint."

#### What claims should you include in a JWT?
- **The Engine Mechanism (Why it behaves this way):** Standard claims: `sub` (subject/user ID), `exp` (expiration time), `iat` (issued at). Custom claims: `roles` (user roles for authorization), `scope` (permissions). Keep the payload small — JWTs are sent with every request, and large tokens increase bandwidth. Don't include: passwords, email addresses (unless needed), PII, or any data that could be a privacy concern. Remember: JWT payload is readable by anyone — it's signed, not encrypted.
- **The Unforgettable Mental Model:** The **ID Card**. An ID card shows: name (sub), expiration date (exp), issue date (iat), and clearance level (roles). It doesn't show your home address, social security number, or bank details.
- **The Trap:** Including too many claims. Large JWTs increase request size and can exceed header size limits in proxies. Keep claims minimal.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I include sub (user ID), exp (expiration), and roles for authorization. I keep the payload small — JWTs are sent with every request. I never include passwords, PII, or sensitive data. JWT payload is readable by anyone — it's signed, not encrypted."

#### How do you handle JWT expiration?
- **The Engine Mechanism (Why it behaves this way):** Set the `exp` claim when creating the token: `to_encode["exp"] = datetime.utcnow() + timedelta(minutes=30)`. When the token expires, jwt.decode raises `ExpiredSignatureError`. The dependency catches this and returns 401. For a better user experience, implement refresh tokens: short-lived access tokens (15-30 minutes) paired with long-lived refresh tokens (7-30 days). When the access token expires, the client uses the refresh token to get a new access token without re-authenticating.
- **The Unforgettable Mental Model:** The **Visitor Badge**. The badge (access token) expires at the end of the day. To come back tomorrow, you don't re-register (re-authenticate) — you use your visitor pass (refresh token) to get a new badge.
- **The Trap:** Setting access tokens to expire too far in the future. If a token is stolen, the attacker has access until expiration. Use short-lived access tokens with refresh tokens.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I set access tokens to expire in 15-30 minutes and use refresh tokens (7-30 days) for renewal. When the access token expires, the client uses the refresh token to get a new one without re-authenticating. This balances security (short access tokens) with user experience (infrequent re-authentication)."

#### How do you test JWT authentication?
- **The Engine Mechanism (Why it behaves this way):** Create test tokens directly: `token = create_token({"sub": "test-user"}, timedelta(minutes=30))`. Use TestClient with the token in the Authorization header: `response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})`. Test valid tokens, expired tokens, invalid signatures, and missing tokens. Override the `get_current_user` dependency to return a mock user for faster tests: `app.dependency_overrides[get_current_user] = lambda: mock_user`.
- **The Unforgettable Mental Model:** The **Fake ID Test**. Instead of going through the real registration process, you create test IDs (test tokens) and verify the checkpoint (auth dependency) handles them correctly — valid, expired, forged, or missing.
- **The Trap:** Testing only with valid tokens. Test edge cases: expired tokens, invalid signatures, malformed tokens, and missing tokens. Each should return 401.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test JWT auth by creating test tokens and sending them in the Authorization header. I test valid, expired, invalid, and missing tokens. For faster tests, I override get_current_user with a mock user. This tests both the auth flow and the endpoint behavior."

## 8. Active recall test

1. **What are the three steps of JWT authentication?**
   - **Explanation:** Login (create signed token), Access (client sends token in Authorization header), Verification (dependency verifies signature, checks expiration, extracts claims).

2. **How do you create a JWT token?**
   - **Explanation:** Use python-jose's jwt.encode() with claims (sub, exp) and a secret key using HS256 algorithm. The secret key must be strong and from environment variables.

3. **How do you verify a JWT in a dependency?**
   - **Explanation:** Use OAuth2PasswordBearer to extract the token, jwt.decode() to verify signature and expiration, and look up the user in the database. Catch JWTError and return 401.

4. **What claims should you include in a JWT?**
   - **Explanation:** sub (user ID), exp (expiration), and roles for authorization. Keep it small. Never include passwords, PII, or sensitive data — JWT payload is readable.

5. **How do you handle JWT expiration?**
   - **Explanation:** Short-lived access tokens (15-30 min) with long-lived refresh tokens (7-30 days). When access token expires, client uses refresh token to get a new one.

6. **How do you test JWT authentication?**
   - **Explanation:** Create test tokens, send in Authorization header, test valid/expired/invalid/missing tokens. Override get_current_user with mock for faster tests.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

JWT Auth in FastAPI should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain JWT Auth in FastAPI, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define JWT Auth in FastAPI.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
