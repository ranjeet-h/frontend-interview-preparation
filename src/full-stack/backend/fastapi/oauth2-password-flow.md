# OAuth2 Password Flow

## Detailed explanation

OAuth2 password flow uses token endpoints and bearer tokens for username/password login patterns. In interviews, connect the framework feature to request lifecycle, validation, dependency management, database safety, testing, and production behavior.

## 1. One-line mental model

Password flow exchanges credentials for bearer token.

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

#### What is the OAuth2 password flow in FastAPI?
- **The Engine Mechanism (Why it behaves this way):** The OAuth2 password flow (Resource Owner Password Credentials) exchanges username and password for an access token. The client sends credentials to a `/token` endpoint, the server validates them against the database, creates a JWT, and returns it as `{"access_token": "...", "token_type": "bearer"}`. FastAPI provides `OAuth2PasswordRequestForm` to parse the form data and `OAuth2PasswordBearer` to extract tokens from subsequent requests. This flow is suitable for first-party applications where the client is trusted (web app, mobile app). It's NOT recommended for third-party clients — use authorization code flow instead.
- **The Unforgettable Mental Model:** The **Hotel Check-In**. You give your ID and credit card (username/password) at the front desk (token endpoint). The desk gives you a room key (access token). You use the key to access your room (protected routes) without showing ID every time.
- **The Trap:** Using password flow for third-party applications. Third-party apps shouldn't handle user passwords directly. Use authorization code flow (with PKCE) for third-party clients.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: OAuth2 password flow exchanges username/password for an access token via a /token endpoint. FastAPI provides OAuth2PasswordRequestForm for parsing and OAuth2PasswordBearer for token extraction. It's suitable for first-party apps where the client is trusted. For third-party apps, I use authorization code flow with PKCE."

#### How do you implement the token endpoint?
- **The Engine Mechanism (Why it behaves this way):** `from fastapi.security import OAuth2PasswordRequestForm; @app.post("/token") def login(form_data: OAuth2PasswordRequestForm = Depends()): user = authenticate_user(form_data.username, form_data.password); if not user: raise HTTPException(401, "Incorrect credentials"); access_token = create_token({"sub": user.username}); return {"access_token": access_token, "token_type": "bearer"}`. `OAuth2PasswordRequestForm` parses `username` and `password` from form data. The endpoint validates credentials, creates a JWT, and returns it. The response format follows the OAuth2 spec for token responses.
- **The Unforgettable Mental Model:** The **Ticket Machine**. You insert your credentials (username/password), the machine validates them, prints a ticket (access token), and hands it to you. The ticket format is standardized (OAuth2 spec).
- **The Trap:** Returning the token in a custom format. OAuth2 clients expect `{"access_token": "...", "token_type": "bearer"}`. Custom formats break OAuth2-compatible clients and Swagger UI's Authorize button.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The token endpoint uses OAuth2PasswordRequestForm to parse credentials, validates them against the database, creates a JWT, and returns the standard OAuth2 format: {access_token, token_type: 'bearer'}. I follow the OAuth2 spec so Swagger UI's Authorize button and OAuth2-compatible clients work automatically."

#### How does OAuth2PasswordBearer work?
- **The Engine Mechanism (Why it behaves this way):** `OAuth2PasswordBearer(tokenUrl="/token")` is a security scheme that tells FastAPI (and OpenAPI docs) where to find the token endpoint. When used as a dependency (`token: str = Depends(oauth2_scheme)`), it extracts the token from the `Authorization: Bearer <token>` header. If the header is missing or malformed, it raises 401 automatically. The `tokenUrl` parameter is used for OpenAPI documentation — it adds the "Authorize" button to Swagger UI that points to the token endpoint.
- **The Unforgettable Mental Model:** The **Mail Slot**. OAuth2PasswordBearer is a mail slot that only accepts letters (tokens) in a specific envelope format (Authorization: Bearer). If the envelope is wrong or missing, the mail is rejected.
- **The Trap:** Confusing OAuth2PasswordBearer with actual token verification. OAuth2PasswordBearer only extracts the token string — it doesn't verify it. You still need to decode and validate the JWT in a separate dependency.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: OAuth2PasswordBearer extracts the token from the Authorization header and tells OpenAPI where the token endpoint is. It doesn't verify the token — it just extracts the string. I use it as the first step in my auth dependency chain, then decode and validate the JWT separately."

#### How do you add the Authorize button to Swagger UI?
- **The Engine Mechanism (Why it behaves this way):** Define the OAuth2 security scheme at the app level: `from fastapi.security import OAuth2; oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")`. When endpoints use this scheme as a dependency, Swagger UI automatically adds an "Authorize" button. Clicking it opens a dialog where users enter credentials, FastAPI calls the token endpoint, stores the token, and includes it in subsequent "Try it out" requests. The `scopes` parameter defines permission levels visible in the UI.
- **The Unforgettable Mental Model:** The **VIP Check-In Desk**. The Authorize button is the desk where you get your VIP wristband (token). Once you have it, you can access VIP areas (protected endpoints) without showing ID again.
- **The Trap:** Not setting tokenUrl correctly. If tokenUrl doesn't match your actual token endpoint, the Authorize button fails to get a token.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I define OAuth2PasswordBearer with the correct tokenUrl and use it as a dependency in protected endpoints. Swagger UI automatically adds an Authorize button. Users enter credentials, get a token, and it's included in all subsequent test requests."

#### Why is password flow not recommended for third-party apps?
- **The Engine Mechanism (Why it behaves this way):** In password flow, the client application handles the user's password directly. This means the user must trust the third-party app with their credentials. If the app is compromised, the password is exposed. The authorization code flow (with PKCE) avoids this — the user enters credentials on the authorization server (not the third-party app), and the app receives a token without ever seeing the password. OAuth2 spec recommends password flow only for first-party, trusted clients.
- **The Unforgettable Mental Model:** The **Bank PIN**. Password flow is like giving your bank PIN to a friend to withdraw money for you. Authorization code flow is like the friend getting a limited-purpose debit card from the bank — they never see your PIN.
- **The Trap:** Using password flow for a mobile app that distributes to unknown users. Mobile apps can be reverse-engineered, exposing the client secret and making password flow insecure.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Password flow requires the client to handle user passwords directly, which is insecure for third-party apps. I use authorization code flow with PKCE for third-party and mobile apps — the user enters credentials on the auth server, and the app never sees the password. Password flow is only for trusted first-party clients."

#### How do you test the OAuth2 password flow?
- **The Engine Mechanism (Why it behaves this way):** Test the token endpoint with valid and invalid credentials: `response = client.post("/token", data={"username": "testuser", "password": "testpass"}); assert response.status_code == 200; token = response.json()["access_token"]`. Test with wrong password (401), missing fields (422), and locked accounts. Test protected endpoints with the obtained token: `response = client.get("/protected", headers={"Authorization": f"Bearer {token}"})`. Test with expired tokens, invalid signatures, and missing tokens.
- **The Unforgettable Mental Model:** The **Security Audit**. You test every entrance: valid credentials get you in, wrong credentials are rejected, missing credentials are blocked, and expired badges don't work.
- **The Trap:** Only testing the happy path. Test invalid credentials, missing fields, expired tokens, and malformed tokens. Each should return the appropriate error.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I test the token endpoint with valid credentials (200), wrong credentials (401), and missing fields (422). I test protected endpoints with valid tokens, expired tokens, and missing tokens. I verify the token format matches the OAuth2 spec and that Swagger UI's Authorize button works."

## 8. Active recall test

1. **What is the OAuth2 password flow?**
   - **Explanation:** Exchanges username/password for an access token via a /token endpoint. Suitable for first-party trusted clients. Not recommended for third-party apps.

2. **How do you implement the token endpoint?**
   - **Explanation:** Use OAuth2PasswordRequestForm to parse credentials, validate against database, create JWT, and return {"access_token": "...", "token_type": "bearer"}.

3. **What does OAuth2PasswordBearer do?**
   - **Explanation:** Extracts the token from the Authorization: Bearer header and tells OpenAPI where the token endpoint is. It doesn't verify the token — just extracts the string.

4. **How do you add the Authorize button to Swagger UI?**
   - **Explanation:** Define OAuth2PasswordBearer with tokenUrl and use it as a dependency in protected endpoints. Swagger UI automatically adds the Authorize button.

5. **Why is password flow not recommended for third-party apps?**
   - **Explanation:** The client handles user passwords directly, which is insecure if the app is compromised. Use authorization code flow with PKCE instead.

6. **How do you test the OAuth2 password flow?**
   - **Explanation:** Test token endpoint with valid/invalid credentials. Test protected endpoints with valid/expired/missing tokens. Verify OAuth2 response format.

## 9. Mistakes / traps

- Putting business logic directly in route handlers.
- Mixing request schemas, database models, and response models.
- Forgetting cleanup for request-scoped dependencies.
- Blocking the event loop with sync I/O inside async routes.
- Returning raw internal errors to clients.

## 10. Compare with related concepts

OAuth2 Password Flow should be compared with neighboring FastAPI concepts by asking whether it belongs to routing, validation, dependency injection, serialization, lifecycle management, database access, or testing.

## 11. Summary from memory

Explain OAuth2 Password Flow, why FastAPI uses it, and how it changes production API behavior.

## 12. Spaced revision prompts

- Day 1: Define OAuth2 Password Flow.
- Day 3: Write a small route using the idea.
- Day 7: Add validation or testing detail.
- Day 14: Explain the production failure it prevents.
