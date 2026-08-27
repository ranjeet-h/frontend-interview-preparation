# Designing Secure Forgot Password Flows: Cryptographic Tokens, Timing Neutrality, and User Enumeration Prevention

## 1. Why This Exists — The Problem First

A team deploys what seems like a simple password recovery endpoint: `POST /api/auth/forgot-password`. If the email is found in the database, the server generates a token and sends an email, returning HTTP `200 OK` in 340ms. If the email is missing, the code exits early and returns `404 Not Found` with `{ "error": "User does not exist" }` in 14ms.

Within 48 hours, an attacker takes a leaked database of 5 million email addresses from an unrelated breach and runs an automated credential-harvesting script against the recovery endpoint. By filtering for `200` vs `404` status codes—and by measuring the 326ms timing discrepancy—the attacker identifies exactly which corporate executives, VIP customers, and high-value targets hold accounts on the platform.

To make matters worse, the engineering team stored the raw random reset tokens directly as plaintext strings in the database. When an old database snapshot leaks from an internal staging environment six months later, hundreds of unexpired reset tokens are exposed, allowing the attacker to hijack accounts instantly without cracking password hashes.

Password reset is not a casual notification feature. It is a public, unauthenticated back door into user accounts. If implemented improperly, it leaks user identities, exposes accounts to hijacking, and allows malicious actors to flood victims with spam.

---

## 2. The Analogy — Make It Obvious

Think of a secure forgot password system as a **Hotel Blind Key Vault**.

Imagine a high-security luxury hotel with private suites. A visitor walks up to the front desk and says, *"I lost the key to Suite 402."*

If the concierge checks an open guest register and says, *"Nobody is registered in Suite 402,"* anyone standing in the lobby learns who is staying at the hotel and who is not.

Instead, the concierge uses a strict **Blind Drop Procedure**:
1. **The Uniform Response:** Regardless of whether Suite 402 is occupied or vacant, the concierge spends the exact same 20 seconds stamping an official envelope, drops it into a pneumatic dispatch tube, and says: *"If someone is registered to Suite 402, a temporary recovery seal has been delivered to their private room."*
2. **The High-Entropy Wax Stamp (Raw Token):** Inside the envelope delivered to the room is a unique, one-of-a-kind physical wax stamp. The front desk does not keep a copy of the stamp.
3. **The Vault Imprint (SHA-256 Hash):** The hotel vault only records the mathematical imprint that the stamp leaves behind. Even if an intruder breaks into the front desk files, they find only imprints, not working stamps.
4. **Single-Use and Expiration:** The guest must bring the stamp to the vault within 15 minutes. The vault presses the stamp into clay to check the imprint. If it matches, the stamp is melted instantly so it can never be used again.
5. **Universal Lock Re-Keying (Session Revocation):** The moment the new master key is handed over, the hotel immediately deactivates every keycard previously issued for that room. Anyone holding an old keycard is locked out immediately.

---

## 3. How It Actually Works — The Full Explanation

Designing a production-ready password recovery system requires coordinating three distinct phases across the network, database, and email infrastructure:

```txt
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASE 1: INITIATING RECOVERY (FORGOT PASSWORD)                                    │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
                                                                                                                   
  User Submits Email                                                                                              
          │                                                                                                       
          ▼                                                                                                       
  [ Rate Limiter ] ──── Exceeded? ───► [ 429 Too Many Requests ]                                                  
          │                                                                                                       
          ▼ (Under limits: IP & Email tiers)                                                                      
  [ DB User Lookup ]                                                                                              
          │                                                                                                       
    ┌─────┴────────────────────────────────┐                                                                      
    │ User Found                           │ User NOT Found                                                       
    ▼                                      ▼                                                                      
  Generate CSPRNG Token (32 bytes)       Execute Dummy Work (equalize CPU time)                                   
  Compute SHA-256 Hash of Token          Do NOT send email                                                        
  Store Hash + 15m TTL in DB             Do NOT write to DB                                                       
  Enqueue Async Email Job (Raw Token)      │                                                                      
    │                                      │                                                                      
    └──────────────────┬───────────────────┘                                                                      
                       ▼                                                                                          
          [ Always Return HTTP 200 OK ]                                                                           
          "If an account exists, a reset link has been sent."                                                     

───────────────────────────────────────────────────────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               PHASE 2: EXECUTING RECOVERY (RESET PASSWORD)                                      │
└─────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘

  User Clicks Email Link: https://app.example.com/reset-password#token=RAW_TOKEN                                   
          │                                                                                                       
          ▼                                                                                                       
  User Submits: { token: RAW_TOKEN, newPassword: "..." }                                                          
          │                                                                                                       
          ▼                                                                                                       
  Compute SHA-256(RAW_TOKEN)                                                                                      
          │                                                                                                       
          ▼                                                                                                       
  [ Atomic DB Transaction ]                                                                                       
    ├── 1. Query token record by SHA-256 hash WHERE used = false AND expires_at > NOW()                           
    ├── 2. If valid: Hash new password (Argon2id / bcrypt)                                                        
    ├── 3. Update user password hash in DB                                                                        
    ├── 4. Invalidate token (used = true or DELETE)                                                               
    └── 5. Revoke all active sessions (increment token_version / purge refresh tokens)                            
          │                                                                                                       
          ▼                                                                                                       
  Return HTTP 200 OK: "Password successfully updated. Please log in with your new credentials."                   
```

---

### The 3 Security Pillars of Password Reset

#### Pillar 1: User Enumeration Defense
User enumeration occurs when an API inadvertently reveals whether a given user identifier (such as an email address or username) exists in the system.

To neutralize enumeration:
- **Identical HTTP Status Code:** Always return `200 OK` (or `202 Accepted`) for any well-formed email address.
- **Identical JSON Response:** Return the exact same message body:
  ```json
  {
    "success": true,
    "message": "If an account matches this email address, a password reset link has been sent."
  }
  ```
- **Consistent Validation Errors:** Only return `400 Bad Request` if the input is malformed (e.g., `"invalid-email-string"`), never because the user is missing.

#### Pillar 2: Timing Attack Neutrality
Even if the API returns identical JSON responses, an attacker can measure the millisecond response time over thousands of requests.
- Finding a user, generating cryptographic entropy, writing a database record, and queuing an email takes significantly more CPU and I/O time than an early `return 200` when a user is not found.
- **Remediation Strategy 1: Asynchronous Email Dispatch.** Never send emails synchronously inside the HTTP handler. Push an email job to an in-memory queue (like Redis + BullMQ or Celery) so the network latency of SMTP providers (SendGrid, Postmark, AWS SES) does not inflate response times.
- **Remediation Strategy 2: Dummy Work.** When a user is not found, execute a dummy CSPRNG generation and dummy hash calculation to mimic the computational profile of a real user recovery request.

#### Pillar 3: Cryptographic Token Architecture
A password reset token is a temporary credential equivalent to a master key. Its lifecycle must follow strict cryptographic principles:

1. **Generation (CSPRNG):** Tokens must be generated using a Cryptographically Secure Pseudo-Random Number Generator (such as Node.js `crypto.randomBytes(32)` or Python `secrets.token_urlsafe(32)`). This provides 256 bits of true entropy, making token prediction mathematically impossible. Never use `Math.random()` or hash deterministic values like `MD5(email + timestamp)`.
2. **Storage (SHA-256 Hash):** The raw token is sent **only** to the user's verified email address. The backend computes the `SHA-256` hash of the raw token and stores only that hash in the database. If an attacker dumps the database or steals a database backup, the stored hashes are useless because reversing a SHA-256 hash of a 256-bit random value is impossible.
3. **Short Expiration (TTL):** Reset tokens should expire after 15 to 30 minutes. A reset token is an emergency recovery tool, not a persistent session.
4. **Single-Use Enforcement:** The database record must track a `used` boolean flag or be deleted immediately upon successful password change within an atomic database transaction.

---

### Why SHA-256 for Tokens vs Argon2/Bcrypt for Passwords?

Engineers often wonder why we use slow algorithms (`Argon2id`, `bcrypt`, `scrypt`) for passwords, but fast algorithms (`SHA-256`) for reset tokens:

| Property | User Passwords | CSPRNG Reset Tokens |
| :--- | :--- | :--- |
| **Entropy Source** | Human memory (low entropy: ~30–40 bits) | OS Cryptographic Randomness (high entropy: 256 bits) |
| **Attack Vector** | Offline dictionary / GPU brute-force attacks | Random guessing / Database theft |
| **Hash Algorithm** | `Argon2id` or `bcrypt` (slow, memory-hard) | `SHA-256` (fast, non-reversible) |
| **Why?** | Slow hashing forces attackers to spend years testing common words. | $2^{256}$ random combinations cannot be brute-forced even at trillions of SHA-256 hashes per second. Fast hashing avoids server CPU exhaustion (DoS). |

---

### Rate Limiting: Dual-Tier Defense

Without rate limiting, malicious actors can abuse the forgot password endpoint to:
1. **Email Bombing / Harassment:** Flooding a victim's inbox with hundreds of legitimate reset emails.
2. **Resource Exhaustion:** Overwhelming the transactional email provider quota and causing Denial of Service.

To prevent this, implement **Dual-Tier Rate Limiting**:
- **IP-Based Limit:** Limit any single IP address to a maximum of 10 reset attempts per 15 minutes.
- **Email-Based Limit:** Limit any specific email address to a maximum of 3 reset attempts per hour. If a user exceeds this threshold, return `429 Too Many Requests` with a `Retry-After` header.

---

### Universal Session Revocation & Invalidation

When a user resets their password, you must assume their account may have been compromised on other devices. A password reset that leaves existing sessions alive fails to protect the user.

When the new password is saved:
1. Update the password hash in the `users` table.
2. Mark the current reset token as `used = true`.
3. Invalidate any other outstanding reset tokens for this user.
4. **Revoke all active sessions:** Increment a `token_version` column in the user table, or delete all active refresh token records from Redis/database. Any JWTs or session cookies issued prior to the reset will fail validation on their next request.

---

## 4. Real Code — See It Working

Here is a complete, production-grade implementation in TypeScript using Node.js, Express, `crypto`, and a relational database abstraction.

### 1. Database Schema (PostgreSQL)

```sql
-- Users Table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    token_version INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Password Reset Tokens Table
CREATE TABLE password_reset_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE, -- SHA-256 produces 64 hex characters
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reset_tokens_lookup ON password_reset_tokens(token_hash) WHERE used = FALSE;
```

---

### 2. Request Recovery Handler (`forgotPassword`)

```typescript
import crypto from 'node:crypto';
import { Request, Response } from 'express';
import { db } from './db';
import { emailQueue } from './queue';

const GENERIC_SUCCESS_MESSAGE = 
  'If an account matches that email address, password reset instructions have been sent.';

/**
 * Computes a standard SHA-256 hash in hexadecimal.
 */
function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

/**
 * Step 1: Initiates password recovery.
 * Defends against user enumeration and timing attacks.
 */
export async function forgotPasswordHandler(req: Request, res: Response): Promise<void> {
  const { email } = req.body;

  // Basic syntax validation
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    res.status(400).json({ error: 'A valid email address is required.' });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  // 1. Look up user by email
  const user = await db.user.findUnique({ where: { email: normalizedEmail } });

  if (user) {
    // 2. Generate a high-entropy 256-bit (32 bytes) CSPRNG raw token
    const rawToken = crypto.randomBytes(32).toString('hex');

    // 3. Compute SHA-256 hash for database storage
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15-minute TTL

    // 4. Invalidate existing active tokens and save new token in an atomic transaction
    await db.$transaction([
      db.passwordResetToken.updateMany({
        where: { userId: user.id, used: false },
        data: { used: true },
      }),
      db.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          used: false,
        },
      }),
    ]);

    // 5. Enqueue background email job with the RAW token (never the hash)
    // The reset URL uses a fragment (#) to prevent token leakage in Referer headers
    const resetUrl = `https://app.example.com/reset-password#token=${rawToken}`;
    await emailQueue.add('send-reset-email', {
      to: user.email,
      resetUrl,
      expiresInMinutes: 15,
    });
  } else {
    // Timing Attack Mitigation:
    // Execute dummy CSPRNG generation and hashing to equalize CPU cycles
    const dummyRawToken = crypto.randomBytes(32).toString('hex');
    hashToken(dummyRawToken);
  }

  // 6. ALWAYS return the identical HTTP 200 response
  res.status(200).json({
    success: true,
    message: GENERIC_SUCCESS_MESSAGE,
  });
}
```

---

### 3. Reset Password Handler (`resetPassword`)

```typescript
import bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import { db } from './db';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Step 2: Verifies token and updates user password.
 * Invalidates token and revokes all active sessions across all devices.
 */
export async function resetPasswordHandler(req: Request, res: Response): Promise<void> {
  const { token, newPassword } = req.body;

  // 1. Input validation
  if (!token || typeof token !== 'string' || token.length !== 64) {
    res.status(400).json({ error: 'Invalid or malformed reset token.' });
    return;
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
    res.status(400).json({ error: 'Password must be at least 12 characters long.' });
    return;
  }

  // 2. Hash the incoming raw token with SHA-256 to look up the DB record
  const incomingTokenHash = hashToken(token);

  // 3. Execute password update and session revocation in an atomic transaction
  try {
    await db.$transaction(async (tx) => {
      // Find valid, unexpired, unused token
      const tokenRecord = await tx.passwordResetToken.findFirst({
        where: {
          tokenHash: incomingTokenHash,
          used: false,
          expiresAt: { gt: new Date() },
        },
      });

      if (!tokenRecord) {
        // Generic error prevents attackers from knowing if token expired or never existed
        throw new Error('INVALID_OR_EXPIRED_TOKEN');
      }

      // Hash the new password with bcrypt / Argon2id
      const newPasswordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);

      // Update user password AND increment token_version (revokes all active JWT sessions)
      await tx.user.update({
        where: { id: tokenRecord.userId },
        data: {
          passwordHash: newPasswordHash,
          tokenVersion: { increment: 1 },
        },
      });

      // Mark the token as used so it can never be replayed
      await tx.passwordResetToken.update({
        where: { id: tokenRecord.id },
        data: { used: true },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. Please log in with your new credentials.',
    });
  } catch (error: any) {
    if (error.message === 'INVALID_OR_EXPIRED_TOKEN') {
      res.status(400).json({
        error: 'Password reset link is invalid or has expired. Please request a new one.',
      });
      return;
    }

    res.status(500).json({ error: 'An unexpected error occurred while resetting your password.' });
  }
}
```

---

## 5. The Interview Questions — All of Them, Done Properly

### **Q: Why must password reset tokens be stored as hashes in the database if they expire in 15 minutes anyway?**

**Answer:**  
Storing reset tokens in plaintext assumes the database will never be compromised while a token is active. In production, database read-replicas, audit logs, automated SQL backup dumps, and read-only SQL injection vulnerabilities can expose table contents to unauthorized viewers.

If reset tokens are stored in plaintext:
1. An attacker who gains read access to the database can instantly copy active reset tokens and take over accounts immediately without needing to crack the salted password hashes.
2. If the user is an administrator or high-privilege account, 15 minutes is more than enough time to execute an automated takeover script.

By storing `SHA-256(raw_token)` in the database and sending `raw_token` only to the user's email, the database holds only the one-way mathematical hash. Even if a full database dump is leaked, the attacker cannot reverse the SHA-256 hash to reconstruct the raw token needed to call the reset endpoint.

---

### **Q: Why do we use SHA-256 to hash reset tokens instead of bcrypt or Argon2?**

**Answer:**  
We use slow hashing algorithms (`bcrypt`, `Argon2id`) for user passwords because human passwords have **low entropy** (typically 30–40 bits). Without artificial computational delays and high memory requirements, an attacker with modern GPUs can test billions of password guesses per second in an offline dictionary attack.

In contrast, a reset token generated via a CSPRNG (`crypto.randomBytes(32)`) has **256 bits of true cryptographic entropy** ($1.15 \times 10^{77}$ combinations). Brute-forcing a 256-bit random string through SHA-256 is mathematically impossible—it would require more energy than exists in the observable universe.

Furthermore, bcrypt requires significant CPU resources (~100ms of CPU time per hash). If the forgot password verification endpoint used bcrypt on high-entropy tokens, an attacker could launch a Denial of Service (DoS) attack by flooding the server with random verification requests, pegging CPU utilization at 100%. SHA-256 computes in microseconds while maintaining absolute cryptographic irreversibility for high-entropy inputs.

---

### **Q: How do you prevent email enumeration when database lookups take 2ms but sending an email takes 300ms?**

**Answer:**  
You must decouple the synchronous HTTP request-response cycle from the email delivery pipeline using an **asynchronous job queue** (e.g., Redis with BullMQ, Amazon SQS, or RabbitMQ).

In the synchronous HTTP handler:
1. Query the database for the user.
2. If found, generate the token, insert the hash into the database, and push a job payload containing the raw token to the queue.
3. If not found, execute a dummy random byte generation and SHA-256 hash calculation to normalize server-side CPU time.
4. Return the HTTP `200 OK` response immediately.

Because the HTTP handler only enqueues a message (which takes 2–5ms) rather than waiting for the external SMTP gateway to complete network handshakes (which takes 200–500ms), the total response time for both existing and non-existent users remains virtually identical (e.g., $15\text{ms} \pm 3\text{ms}$).

---

### **Q: What should happen to existing sessions when a user resets their password?**

**Answer:**  
A password reset must trigger **Universal Session Revocation**. 

If a password reset was prompted by a compromised account, the unauthorized intruder might currently hold active session cookies or JWT refresh tokens on another device. Changing the password without revoking existing credentials leaves the intruder logged in.

To implement universal revocation:
- **Token Versioning:** Maintain a `token_version` integer on the `users` table. Embed `token_version` inside all issued access JWTs. On password reset, increment `token_version` by 1. When incoming API requests validate the JWT against the user profile, tokens with an outdated `token_version` are rejected immediately.
- **Session / Refresh Token Purge:** If using stateful refresh tokens stored in Redis or PostgreSQL, delete or mark invalid all refresh token rows belonging to that `user_id`.

---

### **Q: How can reset tokens leak through HTTP Referer headers, and how do you prevent it?**

**Answer:**  
When an email client opens a link like `https://app.example.com/reset-password?token=secret123`, the browser loads the Single Page Application (SPA). If that page loads third-party external scripts (such as analytics, error trackers like Sentry, or fonts) or contains external links, the browser's default behavior is to send the entire URL—including `?token=secret123` in the query string—in the HTTP `Referer` request header to those third-party domains.

To prevent token leakage:
1. **Use URL Hash Fragments:** Structure the reset link as `https://app.example.com/reset-password#token=secret123`. Browsers **never** send URL fragment identifiers (`#...`) in HTTP request headers or `Referer` headers.
2. **Set Referrer Policy:** Configure the server to serve HTML with the HTTP header:
   ```http
   Referrer-Policy: no-referrer
   ```
3. **Clean the Browser History:** In the frontend SPA, extract the token immediately on mount and sanitize the URL using `window.history.replaceState({}, document.title, '/reset-password')`.

---

## 6. The Traps — What Goes Wrong

### Trap 1: Returning Differentiated Error Messages or Status Codes
- **Wrong Assumption:** Developers believe providing helpful feedback like `"No account found with this email"` creates better UX for legitimate users who made a typo.
- **Why It Fails:** It turns the forgot password endpoint into an open email validation oracle. Attackers feed corporate or breached email lists into the API to extract verified customer lists.
- **The Fix:** Return an identical `200 OK` response with generic wording: *"If an account matches this email, instructions have been sent."*

### Trap 2: Using Weak Random Generators or Deterministic Hashes
- **Wrong Assumption:** Using `Math.random().toString(36)` or hashing `md5(email + Date.now())` to generate the reset token.
- **Why It Fails:** `Math.random()` uses pseudo-random algorithms (like Xoroshiro128+) designed for speed, not cryptographic unpredictability. An attacker who observes a few generated values or knows the server's clock time can seed a local PRNG and predict the exact reset token within seconds.
- **The Fix:** Always use cryptographically secure randomness: `crypto.randomBytes(32)` in Node.js or `secrets.token_urlsafe(32)` in Python.

### Trap 3: Stateless JWTs for Password Reset Without Revocation State
- **Wrong Assumption:** Generating a signed JWT containing `{ userId, exp }` and emailing it, avoiding any database storage.
- **Why It Fails:** Stateless JWTs cannot be revoked before their expiration time. If a user requests a reset, changes their password, and then an attacker intercepts the original email link within its 15-minute validity window, the attacker can reuse the JWT to reset the password a second time.
- **The Fix:** If using a JWT, sign it with a secret that includes the user's current password hash or `token_version` (so changing the password automatically invalidates the signature), or store a single-use token hash in the database.

### Trap 4: Single-Tier Rate Limiting (IP Only)
- **Wrong Assumption:** Applying a rate limit of 5 requests per minute per IP address.
- **Why It Fails:** Distributed botnets utilize residential proxy networks with millions of rotating IPs. An attacker can rotate IPs for every request, bypassing IP-based rate limits and targeting a single victim's email address with thousands of emails.
- **The Fix:** Enforce **Dual-Tier Rate Limiting**: rate limit by client IP (e.g., 10 req/15 min) **and** rate limit by target email address (e.g., 3 req/hour).

---

## 7. Compare With Related Concepts

### Forgot Password vs Magic Link Login
- **The Difference:** A **Magic Link** authenticates the user directly into an active session without modifying their stored credentials. A **Forgot Password flow** requires identity verification via email, prompts the user to define a new password, stores the new hash, and revokes all other active sessions.
- **When to Use Which:** Use Magic Links for passwordless daily authentication. Use Forgot Password when managing credentials and recovering compromised or forgotten accounts.

### Forgot Password vs Email Verification / Activation
- **The Difference:** Email verification confirms ownership of an email address before an unprivileged account is activated; tokens can have longer validity windows (24–48 hours) because no established account data is at risk. Forgot password grants full access to an established, privileged account; it requires short TTLs (15–30 minutes) and immediate session revocation.
- **When to Use Which:** Use Email Verification during onboarding with a 24-hour token. Use Forgot Password for credential recovery with a 15-minute token.

### Forgot Password vs Multi-Factor Authentication (MFA) Recovery
- **The Difference:** Password reset recovers the primary knowledge factor (password). If an account has Multi-Factor Authentication (2FA) enabled, a password reset should **never** bypass the second factor (TOTP / WebAuthn). If the user has lost both their password and their 2FA device, they must enter one-time emergency MFA recovery codes or go through manual identity verification.
- **When to Use Which:** Password reset updates the password factor only. Require 2FA verification either before allowing the reset or on the subsequent login.

---

## 8. 🧠 The Memory Hook — What Sticks

> **A secure forgot password flow is a Blind Vault with a Single-Use Wax Seal:**
> 1. The API gives the **exact same answer** in the **exact same time** regardless of who asks.
> 2. The database stores **only the hash** of the secret, never the key itself.
> 3. Using the key once **melts the seal** and **locks every other door** across all devices.
