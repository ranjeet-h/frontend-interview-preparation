# Designing Secure Reset Password Flows: Token Verification, Session Invalidation, and Race Conditions

## 1. Why This Exists — The Problem First

A user notices suspicious activity on their account from an unfamiliar location. They immediately click "Forgot Password," check their inbox, and submit a new 24-character password. They assume they are safe.

Ten minutes later, the attacker transfers funds out of the account or exports private customer data.

This happens in production all the time when password reset is treated as a simple database update (`UPDATE users SET password_hash = :new_hash`). The user changed their password, but the backend never invalidated existing authentication sessions. The attacker's active session cookie or JWT on their machine remained completely valid.

There is another classic failure mode: network lag. A user on a slow mobile connection taps "Reset Password" twice. Two concurrent HTTP requests hit two separate application servers with the exact same reset token. If the backend reads the token validity before updating its status in separate non-atomic queries, both requests succeed. In a high-concurrency race condition, token reuse can cause database deadlocks, duplicate audit events, or corrupted session stores.

A secure password reset flow is a critical security and state-mutation boundary. It must verify single-use cryptographic proofs, mutate password hashes atomically, invalidate every existing active session across all devices, and immediately notify the account owner.

## 2. The Analogy — Make It Obvious

Think of a password reset flow like an emergency lock re-keying at a high-security hotel.

Imagine you suspect someone made an unauthorized copy of your physical room keycard. You walk down to the hotel front desk and request an emergency lock change:

1. The front desk does not hand you a master key immediately. Instead, they hand you a sealed, single-use voucher with an alphanumeric code. Behind the desk, the manager logs a cryptographic fingerprint of that code in the ledger—not the raw code itself. If an intruder breaks into the manager's office and steals the ledger, they cannot forge the voucher.
2. You take the voucher to the room's digital maintenance terminal. You enter the voucher code along with your new private passcode.
3. In one atomic motion behind the scenes, three things happen simultaneously: the voucher is stamped as permanently destroyed, the mechanical deadbolt is re-pinned to your new passcode, and the central hotel system sends a broadcast radio signal that instantly deactivates every existing keycard previously issued for that room.
4. The hotel front desk immediately sends an automated SMS alert to your phone on file: "Your room lock was re-keyed at 2:15 PM. If you did not authorize this, alert security immediately."

If the hotel re-pinned the lock but forgot to broadcast the deactivation signal, the intruder holding the duplicate card would still be able to open your door. Every step must execute as an unbroken chain.

## 3. How It Actually Works — The Full Explanation

A production-grade reset password flow operates across two distinct phases: Token Issuance (the forgot-password step) and Token Consumption (the reset-password step). The actual credential mutation happens during consumption.

**Step 1: The Request Boundary and Cryptographic Lookup**

When a user clicks the reset link in their email, the frontend loads a form and submits a payload to the backend:

`POST /api/v1/auth/reset-password`
Payload: `{ "token": "raw_random_hex_string", "new_password": "SuperSecretPassword123!" }`

The raw token sent to the user's email is a high-entropy cryptographically secure random string (such as 32 bytes generated via `crypto.randomBytes(32).toString('hex')`).

The database never stores this raw token. If an attacker dumps the database via an SQL injection or backup leak, storing raw tokens would allow them to take over any account currently in a reset window. Instead, the database stores `token_hash = SHA256(raw_token)`.

When the backend receives the raw token in the POST body, it computes `hash = SHA256(raw_token)` and looks up the active token record:

```sql
SELECT id, user_id, expires_at, used_at 
FROM password_reset_tokens 
WHERE token_hash = :hash;
```

The server verifies three conditions:
1. The record exists.
2. `expires_at > NOW()` (typically 15 minutes TTL).
3. `used_at IS NULL` (it has never been consumed).

**Step 2: Atomic Invalidation and Password Mutation**

To eliminate race conditions where two concurrent requests try to use the same token simultaneously, the token invalidation and password hash update must happen inside the same database transaction with strict row locking or conditional updates.

Inside the transaction:
1. The server marks the token as used:
```sql
UPDATE password_reset_tokens 
SET used_at = NOW() 
WHERE id = :token_id AND used_at IS NULL;
```
If the affected row count is 0, another concurrent thread already claimed the token. The transaction immediately rolls back and returns an error.

2. The server hashes the new password using a memory-hard algorithm like Argon2id or Bcrypt with an appropriate work factor (cost 12+).
3. The server updates the user record:
```sql
UPDATE users 
SET password_hash = :new_password_hash, 
    token_version = token_version + 1, 
    updated_at = NOW() 
WHERE id = :user_id;
```
4. The transaction commits. Both operations succeed or neither does.

**Step 3: Global Session Revocation**

Changing the password hash does not automatically kick out active attackers if the application uses JWTs or distributed sessions. You must enforce global session revocation:

- For stateful sessions or stored refresh tokens: Delete or revoke all active rows in `user_sessions` or `refresh_tokens` where `user_id = :user_id`.
- For stateless JWTs: Maintain an integer `token_version` (or `jwt_version`) on the user record in the database and cached in Redis. When the password is changed, increment `token_version`. Every authenticated API request checks that the `token_version` inside the JWT payload matches the user's current `token_version`. Any old JWT minted before the reset is rejected instantly.

**Step 4: Security Notification and Audit Logging**

Once the transaction commits and sessions are revoked:
1. The backend triggers an asynchronous notification job to email the user: "Your password was successfully changed on [Device] from [IP Address]. If you did not perform this action, contact support immediately."
2. An immutable security audit log entry is written: `event: PASSWORD_RESET_SUCCESS`, recording `user_id`, `ip_address`, `user_agent`, and `timestamp`.
3. The API responds with `200 OK` and a simple message: `{"success": true, "message": "Password reset successful. Please log in with your new password."}`. Do not return session tokens in the reset response; force the user through the standard login flow.

## 4. Real Code — See It Working

Here is a production-grade Node.js/TypeScript implementation using an SQL transaction pattern, SHA-256 token hashing, Argon2id password hashing, and session revocation.

```typescript
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { Request, Response } from 'express';
import { db } from './database';
import { redis } from './redis';
import { sendSecurityEmail } from './mailer';
import { auditLog } from './logger';

interface ResetPasswordRequestBody {
  token: string;
  newPassword: string;
}

export async function handleResetPassword(
  req: Request<{}, {}, ResetPasswordRequestBody>,
  res: Response
) {
  const { token, newPassword } = req.body;

  // 1. Input validation at the API boundary
  if (!token || typeof token !== 'string') {
    return res.status(400).json({
      error: { code: 'INVALID_TOKEN', message: 'A valid reset token is required.' }
    });
  }

  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12) {
    return res.status(400).json({
      error: { code: 'WEAK_PASSWORD', message: 'Password must be at least 12 characters.' }
    });
  }

  // 2. Hash raw token using SHA-256 before database lookup
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  const client = await db.getClient();

  try {
    // 3. Begin ACID transaction for atomic verification and credential update
    await client.query('BEGIN');

    // Acquire an exclusive row lock to prevent race conditions on double-submit
    const tokenQuery = `
      SELECT id, user_id, expires_at, used_at
      FROM password_reset_tokens
      WHERE token_hash = $1
      FOR UPDATE;
    `;
    const tokenResult = await client.query(tokenQuery, [tokenHash]);
    const tokenRecord = tokenResult.rows[0];

    // Verify token presence, expiration, and single-use status
    if (!tokenRecord) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: { code: 'INVALID_TOKEN', message: 'Invalid or unrecognized reset token.' }
      });
    }

    if (tokenRecord.used_at !== null) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: { code: 'TOKEN_ALREADY_USED', message: 'This reset link has already been used.' }
      });
    }

    if (new Date() > new Date(tokenRecord.expires_at)) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: { code: 'TOKEN_EXPIRED', message: 'This reset link has expired.' }
      });
    }

    // 4. Mark token as consumed inside the active transaction
    await client.query(
      `UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1;`,
      [tokenRecord.id]
    );

    // 5. Hash new password with Argon2id (memory-hard, resistant to GPU/ASIC cracking)
    const newPasswordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536, // 64 MB
      timeCost: 3,
      parallelism: 4
    });

    // 6. Update user password and increment token_version to invalidate stateless JWTs
    const userUpdateQuery = `
      UPDATE users
      SET password_hash = $1,
          token_version = token_version + 1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING id, email, token_version;
    `;
    const userResult = await client.query(userUpdateQuery, [
      newPasswordHash,
      tokenRecord.user_id
    ]);
    const updatedUser = userResult.rows[0];

    // 7. Revoke all active stateful refresh tokens / sessions in the database
    await client.query(
      `DELETE FROM refresh_tokens WHERE user_id = $1;`,
      [tokenRecord.user_id]
    );

    // Commit all changes atomically
    await client.query('COMMIT');

    // 8. Invalidate Redis session cache / update cached token_version
    await redis.set(`user:${updatedUser.id}:token_version`, updatedUser.token_version);
    await redis.del(`user:${updatedUser.id}:sessions`);

    // 9. Post-commit side effects: Audit log and security notification email
    auditLog({
      event: 'PASSWORD_RESET_SUCCESS',
      userId: updatedUser.id,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'] || 'unknown',
      timestamp: new Date().toISOString()
    });

    sendSecurityEmail({
      to: updatedUser.email,
      subject: 'Security Alert: Your password was changed',
      body: `Your account password was successfully reset on ${new Date().toUTCString()} from IP ${req.ip}. If you did not make this change, please contact security immediately.`
    }).catch(err => console.error('Failed to dispatch security email:', err));

    // 10. Clean response: instruct client to authenticate freshly
    return res.status(200).json({
      success: true,
      message: 'Password has been successfully reset. Please log in with your new credentials.'
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Password reset transaction failed:', error);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred while resetting password.' }
    });
  } finally {
    client.release();
  }
}
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why do we store a SHA-256 hash of the reset token in the database instead of the raw token?**

If you store raw tokens in the database, any read vulnerability—an SQL injection, an unredacted database backup, a read replica compromise, or a rogue employee query—gives the attacker immediate account takeover capabilities for every user with an active reset token. 

By computing `SHA-256(raw_token)` and storing only the resulting hash, the database holds only a one-way mathematical digest. The raw token exists solely in the link sent to the user's email. When the user submits the raw token, the backend hashes it and queries the database for matching hashes. Even with a full database dump, an attacker cannot reverse the hash to discover the raw token needed to call the reset endpoint.

**Q: How do you prevent race conditions when a user double-clicks or an attacker sends concurrent reset requests with the same token?**

Race conditions occur when two requests simultaneously perform a "check-then-act" sequence: both read `used_at IS NULL`, both proceed to hash passwords, and both commit. 

To prevent this, you enforce atomicity at the database level using one of two patterns:
1. Transaction with Row Locking: Start a database transaction and execute `SELECT ... FOR UPDATE` on the token row. The first request locks the row; the second request blocks until the first completes, at which point it reads `used_at IS NOT NULL` and aborts.
2. Atomic Conditional Update: Execute `UPDATE password_reset_tokens SET used_at = NOW() WHERE token_hash = :hash AND used_at IS NULL RETURNING id, user_id`. If two requests fire concurrently, PostgreSQL's row-level lock ensures only one update succeeds (returns 1 row); the other returns 0 rows and is rejected immediately.

**Q: How does global session revocation work if the application uses stateless JWTs?**

Pure stateless JWTs cannot be revoked individually without an external mechanism because the signature verification is mathematical and local to the server.

To solve this for password resets, attach an integer `token_version` (or `security_stamp`) claim to the JWT payload when the user logs in. The current `token_version` is stored in the database on the user record and cached in Redis. During a password reset, you increment `token_version` in the database and update the Redis cache. When any incoming request presents a JWT, your authentication middleware checks `payload.token_version === cached_token_version`. All older tokens minted prior to the password reset fail this check immediately and are rejected with HTTP 401.

**Q: Why shouldn't the password reset endpoint return access/refresh tokens to automatically log the user in?**

Returning authentication tokens directly in the password reset response creates two severe architectural and security risks:
1. Bypassing Multi-Factor Authentication (MFA): If the user has MFA (TOTP / Hardware key) enabled, returning a session token directly from the reset endpoint bypasses the second factor unless you duplicate your entire MFA challenge workflow inside the reset endpoint.
2. Privilege Separation: The reset endpoint's sole responsibility is credential mutation and token invalidation. Forcing the user to redirect to the `/login` endpoint ensures they pass through your canonical authentication pipeline, rate limiters, device fingerprinting, and MFA gates.

**Q: What HTTP status codes and error formats should the reset password API return?**

The reset endpoint should return:
- `200 OK` on successful credential mutation.
- `400 Bad Request` with structured error codes (`INVALID_TOKEN`, `TOKEN_EXPIRED`, `TOKEN_ALREADY_USED`, `WEAK_PASSWORD`) when validation fails.
- `429 Too Many Requests` when rate limits on IP or target account are exceeded.
- `500 Internal Server Error` for unexpected database or transaction failures.

Avoid returning `404 Not Found` for invalid tokens, as this can leak implementation details or resource discovery structures. Keep error payloads structured and uniform.

**Q: How do you prevent user enumeration during the initial forgot-password request phase?**

When a user submits an email to `POST /api/v1/auth/forgot-password`, an attacker could determine if an email exists in your system by measuring response times (timing attack) or looking at different response messages ("User not found" vs "Email sent").

To prevent enumeration:
1. Always return the exact same generic HTTP response regardless of whether the email exists: `{"message": "If an account with that email exists, a password reset link has been sent."}`.
2. Prevent timing differences by ensuring your backend executes a consistent workload (such as a dummy crypto calculation or consistent queue dispatch) even when the email is not found in the database.

## 6. The Traps — What Goes Wrong

**Trap 1: The Zombie Session (No Revocation)**

The developer updates the `password_hash` column and assumes their job is done. Any active attacker session, compromised mobile device token, or stolen browser cookie remains fully active for hours or days. 

Always execute session revocation as a mandatory step in the password reset transaction: purge refresh token records from the database, flush Redis session keys, and increment the user's `token_version`.

**Trap 2: Plaintext Reset Token Storage**

Storing generated reset tokens directly in SQL or Redis columns as plaintext. If an attacker gains read access to the database via SQL injection, debug logs, or an outdated backup snapshot, they can immediately claim all active reset tokens and take over accounts.

Always store `SHA256(raw_token)` in the database and pass the raw token only to the user via their verified communication channel (email).

**Trap 3: Check-Then-Act Concurrency Flaw**

The backend executes a read query to check if the token is valid, performs expensive password hashing outside a transaction, and then runs an update query to mark the token as used. Under high concurrency or network jitter, two requests pass the read check simultaneously, causing duplicate password changes, lock contention, or race condition exploits.

Always wrap the token verification and status update inside a single ACID transaction using `FOR UPDATE` row locking or an atomic conditional update (`WHERE used_at IS NULL`).

**Trap 4: Token Leakage via GET URLs and Referer Headers**

Passing the reset token as a query parameter in a GET request (e.g., `GET /api/reset?token=xyz`). When the reset page loads third-party resources (analytics scripts, CDNs, fonts), the browser includes the full URL—including the reset token—in the HTTP `Referer` header. Furthermore, GET URLs are logged in plain text in browser histories, web server access logs, and proxy caches.

The reset link in the email should only load the client-side SPA form. When the user submits the new password, the client must transmit the token inside a `POST` request body via TLS.

**Trap 5: Returning New Auth Tokens Directly from Reset Endpoint**

Automatically issuing session tokens in the reset response to create a "smoother" UX. This accidentally bypasses MFA requirements, creates inconsistent session records, and complicates frontend routing logic. 

Always return a plain success message and redirect the user to standard login.

## 7. Compare With Related Concepts

**Password Reset vs. Magic Link Authentication**

Both mechanisms use short-lived, single-use cryptographic tokens sent via email. However, their security scope and side effects differ:
- A Magic Link is an authentication mechanism that grants a temporary session without changing stored credentials. It does not invalidate existing sessions.
- A Password Reset is a credential mutation mechanism that destroys the old password, updates the hash, invalidates all existing sessions, and triggers security audit alerts.

Rule of thumb: Use Magic Links for passwordless login; use Password Reset for recovery and credential replacement.

**Reset Token vs. Refresh Token**

- Reset Token: Ephemeral (5–15 min TTL), single-use, high-privilege, used exclusively to rewrite authentication credentials. Never stored in plaintext; validated via SHA-256 hash.
- Refresh Token: Long-lived (days to weeks), multi-use or rotated on exchange, used strictly to obtain new short-lived access tokens without asking for credentials again.

Rule of thumb: A reset token changes credentials; a refresh token maintains an active session.

**Stateful Session Deletion vs. Stateless Token Version Invalidation**

- Stateful Session Deletion: Directly deletes session records in PostgreSQL or Redis keys (`DELETE FROM sessions WHERE user_id = :id`). Fast, explicit, and immediately effective for stateful session architectures.
- Stateless Token Version Invalidation: Increments an integer `token_version` on the user record. Stateless JWTs embed this version in their payload. When the user changes their password, all existing JWTs become invalid because their embedded version no longer matches the database/cache version.

Rule of thumb: Use session deletion if your auth relies on stored session IDs; use token versioning if your auth relies on JWT access tokens.

## 8. 🧠 The Memory Hook

A reset token is a one-time cryptographic voucher: **hash it to store it, burn it in the same transaction that updates the password, and increment the token version to kill every active session on earth.**
