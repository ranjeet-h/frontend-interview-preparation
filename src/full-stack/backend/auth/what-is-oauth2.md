# What is OAuth2

## Detailed explanation

What is OAuth2 is a core auth topic that interviewers use to check whether you can connect definitions to production backend behavior. A strong answer should explain the mental model, the backend problem it solves, the implementation shape, operational trade-offs, and common failure modes.

## 1. One-line mental model

Understand what is oauth2 by linking what it is, why it exists, and how it fails in production.

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

In a production full-stack app, what is oauth2 affects route design, database access, user-visible behavior, error handling, monitoring, and safe deployment.

## 7. Common interview questions

#### What is OAuth 2.0?
- **The Engine Mechanism (Why it behaves this way):** OAuth 2.0 is an authorization framework that enables third-party applications to obtain limited access to a user's resources on another service, without exposing the user's credentials. It involves four roles: Resource Owner (user), Client (third-party app), Authorization Server (issues tokens), and Resource Server (hosts protected resources). The flow: user authorizes the client, the client receives an authorization code, exchanges it for an access token, and uses the token to access resources.
- **The Unforgettable Mental Model:** The **Valet Key**. You give a valet (third-party app) a special key (access token) that starts the car and drives it, but doesn't open the trunk or glove box (limited scope). The valet never gets your house keys (password).
- **The Trap:** Confusing OAuth 2.0 with authentication. OAuth 2.0 is an authorization framework — it grants access to resources, not identity verification. For authentication, use OpenID Connect (OIDC) on top of OAuth 2.0.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: OAuth 2.0 is an authorization framework that allows third-party applications to obtain limited access to a user's resources without exposing credentials. It involves four roles: the resource owner (user), the client (app), the authorization server (issues tokens), and the resource server (hosts resources). The standard flow uses an authorization code that the client exchanges for an access token, which is then used to access protected resources. OAuth 2.0 is about authorization, not authentication — for identity, you use OpenID Connect on top of OAuth 2.0."

#### What are the OAuth 2.0 grant types?
- **The Engine Mechanism (Why it behaves this way):** OAuth 2.0 defines several grant types: (1) Authorization Code — most common for web apps, user authorizes via browser, client receives code, exchanges for token, (2) Authorization Code + PKCE — for SPAs and mobile apps, adds code verifier/challenge to prevent code interception, (3) Client Credentials — for server-to-server authentication, client authenticates directly with the authorization server, (4) Refresh Token — used to obtain new access tokens, (5) Device Code — for input-constrained devices (TVs, IoT).
- **The Unforgettable Mental Model:** The **Different Entry Points**. Authorization Code is the front door (user present, browser redirect). Client Credentials is the service entrance (server-to-server, no user). PKCE is the front door with an extra security check (code verifier). Device Code is the delivery entrance (device with no browser).
- **The Trap:** Using the Implicit grant type for SPAs. Implicit is deprecated because tokens exposed in the browser URL are vulnerable to theft. Use Authorization Code + PKCE instead.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: OAuth 2.0 has several grant types. Authorization Code is the standard for web apps — the user authorizes via browser, the client gets a code, and exchanges it for a token. For SPAs and mobile apps, I use Authorization Code + PKCE, which adds a code verifier/challenge to prevent code interception. Client Credentials is for server-to-server auth. Refresh Token is for obtaining new access tokens. The Implicit grant is deprecated — I always use Authorization Code + PKCE for client-side apps."

#### How does the Authorization Code flow work?
- **The Engine Mechanism (Why it behaves this way):** Step 1: Client redirects user to authorization server with client_id, redirect_uri, scope, and state. Step 2: User authenticates and consents to the requested scopes. Step 3: Authorization server redirects back to redirect_uri with an authorization code and state. Step 4: Client exchanges the code for an access token (and refresh token) by sending the code, client_id, and client_secret to the token endpoint. Step 5: Client uses the access token to access resources.
- **The Unforgettable Mental Model:** The **Concert Ticket Exchange**. You reserve a ticket online (authorization request), go to the will-call window (authorization server), show your ID (authenticate), get a pickup code (authorization code), then exchange the code for the actual ticket (access token) at the box office (token endpoint).
- **The Trap:** Not validating the state parameter. The state parameter prevents CSRF attacks — it ensures the redirect back to the client is from the same flow the client initiated. Always generate a random state and verify it on callback.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The Authorization Code flow has five steps. The client redirects the user to the authorization server with client_id, redirect_uri, scope, and a random state parameter. The user authenticates and consents. The server redirects back with an authorization code and the state. The client exchanges the code for tokens at the token endpoint using its client_secret. The state parameter is critical — it prevents CSRF by ensuring the callback matches the original request. I always validate state and use HTTPS for all endpoints."

#### What is PKCE and why is it needed?
- **The Engine Mechanism (Why it behaves this way):** PKCE (Proof Key for Code Exchange) prevents authorization code interception attacks. The client generates a code_verifier (random string), computes a code_challenge (SHA256 hash of verifier), and sends the challenge with the authorization request. When exchanging the code for tokens, the client sends the original verifier. The authorization server hashes the verifier and compares it with the stored challenge. If they match, the code wasn't intercepted.
- **The Unforgettable Mental Model:** The **Sealed Envelope with Fingerprint**. You send a sealed envelope (authorization request) with a fingerprint hash (code_challenge). When you open it (token exchange), you provide the original fingerprint (code_verifier). If the fingerprints match, the envelope wasn't opened by someone else.
- **The Trap:** Not using PKCE for SPAs. Without PKCE, an attacker who intercepts the authorization code (via malicious app, browser extension, or network attack) can exchange it for tokens. PKCE is now recommended for all OAuth clients, not just public clients.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: PKCE prevents authorization code interception attacks. The client generates a random code_verifier, hashes it to create a code_challenge, and sends the challenge with the authorization request. When exchanging the code for tokens, the client sends the original verifier. The server hashes the verifier and compares it with the stored challenge. PKCE was originally designed for public clients (SPAs, mobile), but it's now recommended for all OAuth clients. I always use PKCE, even for confidential clients."

#### What are OAuth 2.0 scopes?
- **The Engine Mechanism (Why it behaves this way):** Scopes define the level of access the client is requesting. They're space-separated strings like `read:profile write:posts`. The authorization server presents the requested scopes to the user during consent, and the issued access token is limited to the granted scopes. The resource server checks the token's scopes before allowing access to specific resources.
- **The Unforgettable Mental Model:** The **Permission Slip**. The slip lists exactly what the chaperone (client) is allowed to do: "read field trip info, take photos, but no purchasing." Each item is a scope. The parent (user) can approve or deny each item.
- **The Trap:** Requesting more scopes than needed. Over-scoping reduces user trust (why does a weather app need access to my contacts?) and increases the damage if the token is compromised. Follow the principle of least privilege.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: Scopes define the level of access a client is requesting — like `read:profile` or `write:posts`. They're presented to the user during consent, and the issued token is limited to granted scopes. The resource server checks scopes before allowing access. I follow least privilege — requesting only the scopes the app actually needs. Over-scoping reduces user trust and increases the blast radius of token compromise."

#### How does OAuth 2.0 affect the frontend?
- **The Engine Mechanism (Why it behaves this way):** The frontend handles: (1) Redirecting to the authorization server, (2) Receiving the callback with authorization code, (3) Sending the code to the backend for token exchange (never expose client_secret in the frontend), (4) Storing the access token securely, (5) Attaching tokens to API requests, (6) Handling token refresh. For SPAs, the backend should handle the token exchange to keep client_secret secure.
- **The Unforgettable Mental Model:** The **Messenger**. The frontend is the messenger that carries the authorization request to the server and brings back the response. But the messenger doesn't handle the secret exchange — that's done by the backend (the trusted agent).
- **The Trap:** Exposing client_secret in the frontend. SPAs are public clients — they can't keep secrets. The token exchange must happen on the backend, or use PKCE for public clients.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: The frontend handles the OAuth redirect flow — sending the user to the authorization server and receiving the callback with the authorization code. But the token exchange (code for tokens) should happen on the backend to keep the client_secret secure. For SPAs, I use Authorization Code + PKCE, where the backend handles the token exchange. The frontend stores the access token securely (httpOnly cookies) and attaches it to API requests. The frontend never handles the client_secret."

#### What would you monitor for OAuth 2.0?
- **The Engine Mechanism (Why it behaves this way):** Monitor: authorization request rates, token exchange success/failure rates, scope grant rates (which scopes users approve/deny), authorization code redemption latency, token refresh rates, and invalid redirect_uri attempts (indicates misconfiguration or attack). Alert on unusual authorization patterns or high failure rates.
- **The Unforgettable Mental Model:** The **Authorization Pipeline Monitor**. You're watching how many people are entering the pipeline (authorization requests), how many are getting tokens (exchange success), and whether anyone is trying to use the wrong entrance (invalid redirect_uri).
- **The Trap:** Not monitoring invalid redirect_uri attempts. These can indicate misconfiguration or phishing attempts where an attacker tries to redirect to a malicious URL.
- **Senior Interview Playbook (Verbal Script):** "When asked this in an interview, say: I monitor OAuth 2.0 through authorization request rates, token exchange success/failure rates, scope grant rates, code redemption latency, and invalid redirect_uri attempts. Invalid redirect_uri attempts can indicate misconfiguration or phishing. I also monitor token refresh rates and alert on unusual authorization patterns — sudden spikes might indicate a bot attack or a misconfigured client. Scope denial rates help me understand if I'm requesting too many permissions."

## 8. Active recall test

1. **What is OAuth 2.0?**
   - **Explanation:** An authorization framework that enables third-party apps to obtain limited access to user resources without exposing credentials. It's about authorization, not authentication.
2. **What are the four OAuth 2.0 roles?**
   - **Explanation:** Resource Owner (user), Client (third-party app), Authorization Server (issues tokens), Resource Server (hosts protected resources).
3. **Which grant type should you use for SPAs?**
   - **Explanation:** Authorization Code + PKCE. Implicit is deprecated. PKCE prevents code interception attacks and is now recommended for all clients.
4. **What is PKCE?**
   - **Explanation:** Proof Key for Code Exchange — prevents authorization code interception. Client sends a code_challenge (hash) with the auth request and the code_verifier (original) with the token exchange.
5. **Why is the state parameter important?**
   - **Explanation:** It prevents CSRF attacks. A random state is sent with the auth request and verified on callback, ensuring the response matches the original request.
6. **What are OAuth scopes?**
   - **Explanation:** Strings that define the level of access being requested (e.g., `read:profile`, `write:posts`). Presented to user during consent, enforced by resource server.
7. **Should the frontend handle the OAuth token exchange?**
   - **Explanation:** No. The token exchange requires client_secret, which can't be kept secret in the frontend. The backend should handle the exchange. For SPAs, use PKCE with backend token exchange.

## 9. Mistakes / traps

- Giving only a definition without implementation details.
- Ignoring auth, validation, data consistency, or failure handling.
- Forgetting frontend contract impact.
- Designing only the happy path.
- Missing observability and rollback concerns.

## 10. Compare with related concepts

Compare this with nearby topics by asking whether the concern is API contract, database correctness, runtime behavior, security, scaling, deployment, or debugging.

## 11. Summary from memory

Explain What is OAuth2 in your own words, then give one backend example, one frontend impact, and one production failure it prevents.

## 12. Spaced revision prompts

- Day 1: Define What is OAuth2 in one sentence.
- Day 3: Write or sketch a minimal example.
- Day 7: Explain edge cases and failure modes.
- Day 14: Compare with a related full-stack topic.
