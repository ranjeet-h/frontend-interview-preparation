# 18. Design Session Management

[← Easy examples](index.md)

**Why interviewers ask:** Sessions bridge stateless HTTP and logged-in users. Interviewers test secure token generation, server-side vs client-side storage, expiry, rotation, and hijacking defenses — often adjacent to auth but focused on request-time validation.

**Core insight:** On login create a random session id, store session record server-side (or signed token with short life), validate on every request, expire and rotate aggressively.

**Architecture**

```txt
Login success → Session service creates session_id (crypto random)
              ↓
         Session store (Redis: session_id → user_id, expiry, metadata)
              ↓ Set-Cookie (HttpOnly, Secure, SameSite)
Client requests → API middleware validates session → attach user context
              ↓ logout / expiry
         Delete session row + clear cookie
```

- **Session store:** Redis with TTL matching session lifetime — fast get on every authenticated request; cluster for HA.
- **Session tokens:** 128+ bit random ids — never sequential; optional secondary rotation token for sensitive actions.
- **Cookie policy:** HttpOnly (no JS access), Secure (HTTPS only), SameSite=Lax/Strict — reduces XSS and CSRF session theft.
- **HTTPS only:** Session ids meaningless if sent over plaintext — terminate TLS at edge.
- **Validation middleware:** Central gate — reject expired or missing session before handler logic; optional sliding expiry on activity.

**Key decisions**

- **Server session vs JWT in cookie:** Server session enables instant revocation and smaller cookies; JWT avoids Redis lookup but revocation is harder.
- **Sliding vs fixed expiry:** Sliding extends on activity (better UX); fixed expiry simpler for security audits — often 24h sliding with max absolute cap.
- **Session fixation defense:** Regenerate session id on login privilege change — attacker cannot preset id before user authenticates.

**Scale & failure:** Redis session store memory or connection count under global login spike breaks first. Mitigation: TTL discipline, session data minimal (user id only), and Redis cluster with read preference for validation.

**Memory hook:** Session is a coat-check ticket — random number on a server rack, cookie is the ticket in the user's hand, invalidate the rack slot on logout.
