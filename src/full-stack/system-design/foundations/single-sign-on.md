# Single Sign-On (SSO)

## 1. Why This Exists — The Problem First

Your company runs twelve internal tools. HR portal, expense system, code repo, analytics dashboard — each one asks for a username and password. Employees reuse weak passwords, forget which login goes where, and call IT every Monday. When someone leaves, IT has to disable accounts in twelve places and inevitably misses one.

Single Sign-On fixes this by making **one identity provider (IdP)** the source of truth. The user signs in once. Every connected application trusts that login and grants access without asking for credentials again. Better experience for users, centralized control for security teams, and one place to enforce MFA, revoke access, and audit who logged in where.

## 2. The Analogy — Make It Obvious

Think of SSO like a **hotel key card**.

You check in at the front desk once (the Identity Provider). They verify your ID, issue a key card, and log you in their system. That card opens your room, the gym, the pool, and the business center (different applications) — you don't re-check-in at every door.

Each door lock (application) doesn't store your passport. It asks the front desk system, "Is this card valid right now?" The card has an expiry. If you lose it, the front desk deactivates it and every door stops working immediately.

In SSO terms:

- **Front desk** = Identity Provider (Okta, Azure AD, Google Workspace, Auth0)
- **Key card** = token or assertion proving authentication
- **Door locks** = Service Providers / applications relying on the IdP
- **Deactivating a lost card** = centralized session revocation

The analogy breaks if you overthink it — hotel cards don't use SAML XML — but the core idea holds: **authenticate once, access many, manage centrally**.

## 3. How It Actually Works — The Full Explanation

SSO is a **pattern**, not a single protocol. The goal is always the same: centralize authentication and federate trust to multiple apps.

### Core players

- **Identity Provider (IdP):** authenticates the user, issues proof of identity
- **Service Provider (SP):** the application the user wants to access
- **User agent:** typically the browser, which redirects between IdP and SP

### The high-level flow

1. User visits App A (SP).
2. App A sees no valid session and redirects to the IdP login page.
3. User authenticates at the IdP (password, MFA, biometrics).
4. IdP issues a **token or assertion** proving authentication.
5. User is redirected back to App A with that proof.
6. App A validates the proof, creates a local session, grants access.
7. User visits App B — same flow, but if the IdP session is still alive, the user may not need to type credentials again (true "single" sign-on).

### Protocols you'll hear in interviews

**SAML 2.0 (Security Assertion Markup Language)**

- Enterprise standard for years. XML-based **assertions** exchanged between IdP and SP.
- Browser redirect flow (SP-initiated or IdP-initiated).
- Common in corporate environments: Salesforce, Workday, legacy enterprise apps.
- Verbose XML, but standardized and well-understood by IT teams.

**OAuth 2.0**

- An **authorization framework**, not authentication by itself. Answers: "Can App A access my data on App B on my behalf?"
- Defines flows (authorization code, client credentials, etc.) and how tokens are issued.
- Modern web and mobile apps use OAuth for delegated access (e.g., "Sign in with Google" that also requests calendar scope).

**OpenID Connect (OIDC)**

- A thin identity layer **on top of OAuth 2.0**. This is what makes OAuth work for login.
- Returns an **ID token** (usually a JWT) with claims about the user (`sub`, `email`, `name`).
- The interview phrase: "OAuth is authorization; OIDC is authentication built on OAuth."

### What the token carries

After successful SSO, applications receive proof containing:

- **Who** the user is (subject identifier)
- **Who issued** it (issuer)
- **When** it expires
- Optional **attributes** (email, groups, roles)

Apps map IdP groups to local permissions. The IdP owns identity; each app still owns authorization (what this user can do inside this app).

### Benefits

- **Better UX:** one login, fewer passwords
- **Centralized security:** enforce MFA, password policy, anomaly detection in one place
- **Faster offboarding:** disable one account, lose access everywhere
- **Audit trail:** IdP logs every authentication event

### Risks to know

- **IdP becomes a single point of failure** — if Okta is down, nobody logs in anywhere
- **Token theft** — if an attacker steals a session token, they may access multiple apps
- **Misconfigured trust** — wrong certificate or audience validation lets forged assertions through

## 4. Real Code — See It Working

### OIDC authorization code flow (simplified)

This is what "Sign in with Google/Azure/Okta" uses under the hood.

```text
# Step 1: App redirects user to IdP
GET https://idp.example.com/authorize?
  response_type=code&
  client_id=my-app&
  redirect_uri=https://app.example.com/callback&
  scope=openid email profile&
  state=random-csrf-token

# Step 2: User logs in at IdP; IdP redirects back with auth code
GET https://app.example.com/callback?code=AUTH_CODE&state=random-csrf-token

# Step 3: App exchanges code for tokens (server-side, with client secret)
POST https://idp.example.com/token
  grant_type=authorization_code
  code=AUTH_CODE
  client_id=my-app
  client_secret=SECRET
  redirect_uri=https://app.example.com/callback

# Response includes:
# - id_token (JWT with user claims)
# - access_token (for API calls)
# - refresh_token (optional, for long-lived sessions)
```

### Validating an ID token (Node.js with `jose`)

```javascript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const JWKS = createRemoteJWKSet(
  new URL('https://idp.example.com/.well-known/jwks.json')
);

async function verifyIdToken(idToken) {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: 'https://idp.example.com',
    audience: 'my-app', // must match your client_id
  });
  // payload.sub = stable user ID
  // payload.email, payload.name, etc.
  return payload;
}
```

### SAML is XML, not code you'd write by hand

In practice you configure SAML in the IdP admin console and use a library (Passport-SAML, Spring Security SAML). The SP receives a base64-encoded SAML assertion via POST redirect and validates signature against the IdP's certificate.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is Single Sign-On?**

SSO lets a user authenticate once with a central Identity Provider and access multiple applications without logging in again at each one. The IdP issues a token or assertion that each Service Provider validates. Security teams manage users, MFA, and revocation in one place.

**Q: Walk me through the SSO flow.**

User hits App A → no session → redirect to IdP → user authenticates → IdP issues token/assertion → redirect back to App A with proof → App A validates, creates local session → user is in. When the user opens App B, the IdP session may still be valid, so they get in without re-entering credentials.

**Q: What is the difference between SAML and OAuth/OIDC?**

SAML is an XML-based protocol designed for enterprise SSO between browsers and SPs — common in corporate apps. OAuth 2.0 is an authorization framework for delegated access. OIDC adds an identity layer on OAuth with an ID token (JWT) for authentication. Modern web and mobile apps favor OIDC; legacy enterprise apps often still use SAML.

**Q: What is an Identity Provider vs a Service Provider?**

The IdP authenticates users and issues identity proof (SAML assertion, OIDC ID token). The SP is the application the user wants to use — it trusts the IdP and consumes that proof instead of managing its own password database.

**Q: How does "Sign in with Google" relate to SSO?**

It's OIDC on top of OAuth. Google is the IdP. Your app is the SP. The user authenticates with Google, Google returns an ID token with claims, your app creates a session. If the user is already logged into Google, they may skip the password screen — that's the SSO experience.

**Q: What are the benefits of SSO?**

Better user experience (one password), centralized security policy (MFA, password rules), faster employee offboarding (one account disable), and consolidated audit logs. IT spends less time on password resets.

**Q: What are the risks of SSO?**

The IdP is a single point of failure and a high-value attack target. Stolen tokens can grant access to multiple apps. Misconfigured trust relationships (wrong certificates, missing audience checks) can allow token forgery. You need monitoring, short token lifetimes, and refresh token rotation.

**Q: How do you log a user out of everything?**

**Single Logout (SLO)** in SAML can propagate logout to all SPs, but it's inconsistently supported. In OIDC, you revoke refresh tokens at the IdP and clear local sessions in each app. True universal instant logout is hard — many systems settle for short access token TTL plus IdP session expiry.

**Q: Does SSO mean the app doesn't need authorization?**

No. SSO handles **authentication** (who are you?). Each app still needs **authorization** (what can you do?). The IdP may pass groups or roles as claims, but the app maps those to its own permissions.

## 6. The Traps — What Goes Wrong

**Trap: Saying OAuth is an authentication protocol.**

OAuth alone delegates access to resources. **OIDC** adds authentication via the ID token. In interviews, say "OAuth for authorization, OIDC for login" unless you're specifically discussing OAuth-only flows like service-to-service.

**Trap: Storing passwords in every app anyway.**

SSO's point is the SP never sees the user's password. If each app still has a password table "just in case," you've duplicated the problem.

**Trap: Not validating tokens properly.**

Accepting a JWT without checking `issuer`, `audience`, `exp`, and signature is an open door. Always validate against the IdP's JWKS or SAML certificate.

**Trap: Ignoring the IdP outage.**

If your IdP goes down, no one logs in. Plan for status page communication, cached session grace periods, and break-glass admin accounts — but don't casually bypass SSO in production.

**Trap: Confusing SSO with shared sessions.**

SSO means re-authentication is federated. Each app may still have its own local session cookie. Being logged into App A doesn't automatically mean App B has a session — it means App B can get one without re-prompting for credentials if the IdP session is alive.

## 7. Compare With Related Concepts

| Concept | Role | vs SSO |
|---|---|---|
| **Basic auth** | Username/password per request | No federation; every app stores credentials |
| **LDAP/Active Directory** | Directory of users | Often the backend the IdP reads from; not SSO by itself |
| **JWT** | Token format | SSO may use JWT (OIDC); JWT is not SSO alone |
| **OAuth 2.0** | Authorization framework | SSO commonly uses OIDC (OAuth + identity) |
| **SAML** | Enterprise SSO protocol | One way to implement SSO; XML-heavy, browser-centric |
| **MFA** | Extra verification factor | Complements SSO; enforced at the IdP |

**Rule of thumb:** enterprise browser apps → SAML is still common; modern web/mobile APIs → OIDC; never say "we use OAuth for SSO" without mentioning OIDC or ID tokens.

## 8. 🧠 The Memory Hook — What Sticks

SSO is a hotel key card: check in once at the front desk (IdP), open every door (app) without showing your passport again. **SAML** = enterprise XML assertions. **OAuth** = "can this app act on my behalf?" **OIDC** = OAuth plus an ID token that answers "who logged in?" Authentication is centralized; authorization still belongs to each app.
