# JWT vs OAuth vs SAML

## 1. Why This Exists — The Problem First

A junior dev says "we'll use JWT for authentication." A security engineer says "we need OAuth." Enterprise IT says "everything must be SAML." Three acronyms, three meetings, zero clarity. Meanwhile someone builds a system that stores JWTs in localStorage with no expiry check, calls it "OAuth login" without an ID token, and wonders why sessions can't be revoked.

These three are not competitors picking one winner. They solve **different layers** of the identity problem. Mixing them up in an interview — "JWT vs OAuth, which is better?" — is like asking "JSON vs HTTP, which is better?" Wrong question. JWT is a **token format**. OAuth is an **authorization framework**. SAML is an **enterprise SSO protocol**. Once you see the layers, the choice becomes obvious.

## 2. The Analogy — Make It Obvious

Think of getting into a secure office building.

**JWT** = the **plastic badge** itself. It's self-contained: your name, department, and expiry date are printed on it. Security at each door reads the badge directly — they don't always call HR. Fast, but if the badge is forged or stolen before expiry, it's trusted until someone updates the revocation list.

**OAuth 2.0** = the **visitor authorization process**. "Is this contractor allowed to access the 3rd-floor lab on behalf of the host?" OAuth defines how apps ask permission, how users consent, and how access tokens are issued. It's about **delegation** — App A acting with limited rights on App B's resources.

**SAML** = the **corporate federation letter**. A trusted headquarters (IdP) sends a signed XML document to a branch office (SP) saying "this employee is authenticated, here are their attributes." Common when both sides are enterprise systems that agreed on XML trust years ago.

You often see them together: OAuth flow completes → ID token is a JWT → enterprise SSO might use SAML instead of OIDC for the same federated login idea.

## 3. How It Actually Works — The Full Explanation

### JWT (JSON Web Token)

A **compact, self-contained token format** — not a protocol, not a login flow by itself.

Structure: `header.payload.signature` (Base64URL-encoded, dot-separated).

- **Header:** algorithm (`alg`) and type (`typ`)
- **Payload:** claims — `sub` (subject), `exp` (expiry), `iss` (issuer), custom roles
- **Signature:** proves the token wasn't tampered with (HMAC or asymmetric key)

**Properties:**

- **Stateless verification:** API can validate signature + claims without calling the auth server every request (if you trust the key and accept no instant revocation)
- **Self-contained:** user info travels with the token
- **Common uses:** API access tokens, OIDC ID tokens, service-to-service auth

**Limitations:**

- Can't easily revoke before expiry without a blocklist (defeats statelessness)
- Payload is Base64, not encrypted — don't put secrets in it
- Large tokens in every request add overhead

### OAuth 2.0

An **authorization framework** — a set of rules for how a client obtains limited access to a resource owner's resources.

**Key roles:**

- **Resource owner:** the user
- **Client:** the app requesting access
- **Authorization server:** issues tokens after user consent
- **Resource server:** the API holding protected data

**Common flows:**

- **Authorization code** (with PKCE for SPAs/mobile): user redirects to auth server, logs in, client exchanges code for tokens — most secure for user login
- **Client credentials:** machine-to-machine, no user involved
- **Refresh token:** get new access tokens without re-login

**Critical distinction:** OAuth 2.0 alone answers "can this app access that API?" It does **not** standardize identity claims. That's why **OpenID Connect (OIDC)** exists — it adds an **ID token** (usually JWT) for authentication.

Interview line: **OAuth = authorization. OIDC = authentication on top of OAuth.**

### SAML (Security Assertion Markup Language)

An **XML-based protocol** for exchanging authentication and authorization assertions between an Identity Provider and a Service Provider.

**Flow (simplified):**

1. User tries to access SP (e.g., Salesforce).
2. SP redirects to IdP (e.g., Okta).
3. User authenticates at IdP.
4. IdP POSTs a signed SAML assertion back to SP.
5. SP validates signature and certificate, creates session.

**Properties:**

- **Enterprise SSO standard** for a decade+
- **Verbose XML** — larger payloads than JWT
- **Browser-centric** redirect/POST bindings
- Strong in B2B, government, universities, legacy apps

### How they combine in real systems

| Scenario | Typical stack |
|---|---|
| Modern SPA + API | OIDC (OAuth 2.0) → ID token (JWT) + access token |
| Mobile app login | OAuth authorization code + PKCE → JWT tokens |
| Enterprise SSO to SaaS | SAML assertion between IdP and SP |
| Microservice auth | JWT bearer tokens, validated via JWKS |
| "Sign in with Google" | OIDC — Google is IdP, JWT is the ID token format |

## 4. Real Code — See It Working

### JWT structure (decoded)

```json
// Header
{ "alg": "RS256", "typ": "JWT" }

// Payload (claims)
{
  "sub": "user-123",
  "email": "dev@example.com",
  "iss": "https://auth.example.com",
  "aud": "my-api",
  "exp": 1710000000,
  "iat": 1709996400
}

// Signature = RS256(base64(header) + "." + base64(payload), privateKey)
```

### API validating a JWT bearer token

```javascript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://auth.example.com/.well-known/jwks.json')
);

export async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'missing token' });

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: 'https://auth.example.com',
      audience: 'my-api',
    });
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'invalid token' });
  }
}
```

### OAuth 2.0 authorization code exchange (simplified)

```javascript
// After user returns with ?code=...
const tokenResponse = await fetch('https://auth.example.com/oauth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    grant_type: 'authorization_code',
    code: authCode,
    client_id: 'my-spa',
    redirect_uri: 'https://app.example.com/callback',
    code_verifier: pkceVerifier, // PKCE for public clients
  }),
});

const { access_token, id_token, refresh_token } = await tokenResponse.json();
// id_token is a JWT (OIDC) — use for identity
// access_token — use for API calls
```

### SAML (configuration, not hand-written XML)

```xml
<!-- SP metadata snippet — trust is established via certificates -->
<EntityDescriptor entityID="https://app.example.com/saml">
  <SPSSODescriptor AuthnRequestsSigned="true"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="https://app.example.com/saml/acs"
      index="0" />
  </SPSSODescriptor>
</EntityDescriptor>
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is JWT?**

A compact, URL-safe token **format** with three parts: header, payload, and signature. The payload holds claims (user ID, expiry, roles). APIs verify the signature to trust the claims without a database lookup on every request. JWT is the envelope, not the delivery protocol.

**Q: What is OAuth 2.0?**

An authorization framework defining how applications obtain limited access to user resources. It specifies flows (authorization code, client credentials), roles (client, resource server, authorization server), and token exchange. It delegates access — "this app can read my calendar" — rather than defining identity by itself.

**Q: What is SAML?**

An XML-based protocol for federated SSO between an Identity Provider and Service Provider. The IdP sends a signed assertion proving the user authenticated. Standard in enterprise environments for browser-based SSO to apps like Salesforce, Workday, and internal portals.

**Q: JWT vs OAuth — which should I use?**

Wrong comparison. JWT is a token format; OAuth is a protocol framework. Modern login uses **OAuth 2.0 + OIDC**, which returns JWTs (ID token, sometimes access token). Say: "OAuth defines the flow; JWT is often the token format inside it."

**Q: When do you use SAML vs OIDC?**

SAML for legacy enterprise SSO, especially B2B SaaS integrating with corporate IdPs that standardize on SAML. OIDC for modern web, mobile, and API-first apps — simpler JSON/JWT, better SPA support, OAuth ecosystem. Greenfield apps almost always pick OIDC; enterprise procurement often still demands SAML.

**Q: What are the advantages of JWT?**

Stateless verification (no session store lookup per request), self-contained claims, works well across microservices and CDNs, compact compared to XML SAML assertions. Good for horizontal API scale.

**Q: What are JWT weaknesses?**

Hard to revoke instantly (token valid until `exp`), payload is readable (not secret), token size grows with claims, `none` algorithm attacks if libraries aren't configured strictly. Storing in localStorage exposes XSS risk.

**Q: Is OAuth an authentication protocol?**

Not by itself. OAuth 2.0 is authorization. **OpenID Connect** adds authentication via the ID token. Always mention OIDC when discussing "OAuth login."

**Q: Why is SAML still used?**

Enterprise adoption, standardized XML contracts, existing IdP/SP integrations, compliance environments, and vendor support. Replacing SAML in large orgs is a multi-year migration, not a npm install.

**Q: How do you secure JWTs in a SPA?**

Prefer **HttpOnly, Secure, SameSite cookies** for tokens (BFF pattern) over localStorage. Short access token TTL, refresh token rotation, validate `iss`, `aud`, `exp`, and algorithm. Use PKCE for authorization code flow.

## 6. The Traps — What Goes Wrong

**Trap: "We use JWT for security."**

JWT is a format. Security comes from signature validation, short expiry, secure storage, HTTPS, and proper flow (OIDC). An unsigned or `alg: none` JWT is a fancy JSON blob.

**Trap: Storing JWTs in localStorage.**

Any XSS steals the token. Prefer HttpOnly cookies or in-memory storage with refresh via secure backend.

**Trap: No expiry or audience validation.**

Accepting any signed JWT without checking `exp`, `aud`, and `iss` lets tokens meant for other apps work on yours.

**Trap: Using OAuth without OIDC for user login.**

You'll get an access token but no standard identity claims. You'll hack together user info endpoints instead of using an ID token.

**Trap: Putting sensitive data in JWT payload.**

JWTs are signed, not encrypted. Anyone with the token reads the payload. Use JWE if encryption is required, or don't put secrets in claims.

**Trap: Expecting instant logout with stateless JWTs.**

Until expiry, the token works. Fix with short TTL + refresh token revocation, or a server-side denylist for high-security cases.

**Trap: SAML vs OIDC as a beauty contest.**

It's an ecosystem fit question. Telling a bank "SAML is dead" ignores their IdP contracts and compliance history.

## 7. Compare With Related Concepts

| Concept | Layer | One-line role |
|---|---|---|
| **JWT** | Token format | Self-contained signed claims |
| **OAuth 2.0** | Authorization framework | Delegated access flows |
| **OIDC** | Auth layer on OAuth | Login + ID token (JWT) |
| **SAML** | SSO protocol | XML assertions for enterprise federation |
| **Session cookies** | Server-side session | Stateful, easy revocation, harder across microservices |
| **API keys** | Simple auth | Service identification, not user identity |

**When to use what:**

- **Modern API + SPA/mobile login** → OIDC (OAuth flow + JWT ID token)
- **Service-to-service** → OAuth client credentials + JWT access tokens
- **Enterprise SSO to SaaS** → SAML (or OIDC if IdP supports both)
- **Internal admin tool, single monolith** → session cookies may be simpler than JWT

## 8. 🧠 The Memory Hook — What Sticks

Wrong question, right layers: **JWT** is the badge (token format). **OAuth** is the permission process (authorization framework). **SAML** is the corporate federation letter (enterprise SSO protocol). Modern APIs: OAuth flow → OIDC ID token → JWT inside. Enterprise browser SSO: SAML XML assertions. Say the layer first, then the tool.
