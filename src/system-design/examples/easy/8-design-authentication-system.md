# 8. Design Authentication System

[← Easy examples](index.md)

**Why interviewers ask:** Auth mistakes become breaches. Interviewers want secure credential storage, token/session lifecycle, MFA hooks, and a clean split between authentication (who you are) and authorization (what you can do).

**Core insight:** Verify identity once at login, issue short-lived proof (JWT or session id), store secrets hashed never plaintext, and design revocation and refresh explicitly.

**Architecture**

```txt
Client → Auth API (login / register / refresh / logout)
              ↓
         User DB (bcrypt password hashes + MFA flags)
              ↓
         Token service (JWT issue + validate) OR session store (Redis)
              ↓
         OAuth broker (Google/GitHub) for social login
              ↓
         Audit log (login attempts, lockouts, admin actions)
```

- **User database:** Email/username unique; passwords stored as salted bcrypt/argon2 hashes; MFA secrets encrypted at rest.
- **JWT token service:** Access token short-lived (15 min); refresh token longer, stored hashed or in DB for revocation; validate signature + expiry on each request.
- **OAuth integration:** Redirect to provider, exchange code server-side, link or create local user — never trust client-provided provider tokens blindly.
- **MFA service:** TOTP or SMS second step after password; required for sensitive accounts or step-up auth.
- **Audit logging:** Failed logins, password changes, token refresh — supports fraud detection and compliance.

**Key decisions**

- **JWT vs server sessions:** JWT scales statelessly for APIs; server sessions in Redis simplify revocation — hybrid: short JWT + refresh token in DB is common.
- **bcrypt/argon2 vs fast hashes:** Slow password hashes only — SHA256 is wrong for passwords; tune cost factor for ~200–500ms hash time.
- **Rate limiting on login:** Throttle by IP + account — stops credential stuffing without locking legitimate users globally.

**Scale & failure:** Login endpoint under credential-stuffing attack or DB read load on token validation breaks first. Mitigation: rate limits, CAPTCHA after failures, and read-through cache for public keys / session lookups.

**Deep link:** [Design an authentication system](../../backend-designs/design-an-authentication-system.md)

**Memory hook:** Auth proves identity once, then hands a expiring hall pass — hash the secret, short-lived pass, refresh or revoke when the pass is stolen.
