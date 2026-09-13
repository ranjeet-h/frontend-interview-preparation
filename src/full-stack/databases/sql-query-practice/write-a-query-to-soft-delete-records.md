# Write a Query to Soft Delete Records in SQL: Pattern, Partial Indexes, and Cascade Handling

## 1. What the Interviewer Is Really Testing

This looks like a one-liner — "just do an UPDATE instead of a DELETE" — and a junior stops there. A user clicked "Delete account" last week, now support needs to restore it, legal needs to know exactly when it was deleted, and analytics suddenly counts that user as active again. If you actually ran `DELETE FROM users WHERE id = 1`, that row is gone. No restore, no timestamp, no audit trail.

That is why interviewers ask soft delete. They are not testing whether you can write `UPDATE`. They are testing whether you understand what breaks the moment you stop physically deleting rows.

First, schema choice. `is_deleted BOOLEAN` versus `deleted_at TIMESTAMPTZ NULL`. A boolean tells you if, a timestamp tells you when. The timestamp lets you answer "when was this deleted", enforce a 90-day purge policy, and sort by deletion time. It also plays nicely with indexing because `NULL` means active and `NOT NULL` means deleted.

Second, the unique constraint trap. If `users.email` has a plain `UNIQUE` index and `alice@example.com` soft-deletes, nobody can ever register that email again — not even Alice herself — because the old row still holds the value. You need a partial unique index that only enforces uniqueness among active rows.

Third, the broken cascade. `ON DELETE CASCADE` only fires on a real `DELETE`. It ignores `UPDATE`. So when you soft-delete a parent, child rows like `user_tokens`, `subscriptions`, or `comments` stay happily alive unless you cascade the soft-delete yourself in a transaction.

Fourth, query hygiene and bloat. Every future `SELECT` now needs `WHERE deleted_at IS NULL`. Forget it once and you leak deleted users into search results, emails, or reports. Seniors fix that with a view, a default scope, or row-level security, and they know that in MVCC engines an `UPDATE` creates a new tuple version that must be vacuumed later.

If you can talk through all four, you have shown you can own soft delete in production, not just write the syntax.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice is the word "soft". The interviewer is deliberately saying do not destroy data. My instinct is to reach for `DELETE` because that is what SQL teaches first, but soft delete means keep the row and mark it as dead. So mentally I translate the request to "which column marks dead, and how do I set it safely?"

The naive answer is `UPDATE users SET deleted_at = NOW() WHERE id = 1`. It works once. Why is it not good enough? I immediately ask about re-running it. If a webhook retries or a user double-clicks, do I overwrite the original timestamp with a newer one? That would destroy audit history. I want idempotency, so I add `AND deleted_at IS NULL`. Now a second call touches zero rows and the original time is preserved. I can also check the affected-row count to know if I was the one who actually deleted it.

Next I think about data shape. Most soft-delete tables use either `is_deleted TINYINT DEFAULT 0` (MySQL) or `deleted_at TIMESTAMPTZ DEFAULT NULL` (PostgreSQL). I prefer `deleted_at` because it subsumes the boolean — `NULL` means alive, any timestamp means dead — and it gives me the when for free. If the schema already uses `is_deleted`, the same logic applies with `SET is_deleted = 1 WHERE is_deleted = 0`.

Then I ask what else holds this user's data. If I only mark `users` and leave `user_tokens` active, a stolen token still authenticates. Foreign keys will not help me here. I need to think transactionally: update the parent and all children together, either in one explicit `BEGIN ... COMMIT` block or in a single writable CTE that does both updates atomically.

Finally I think about reads. After this change every `SELECT` in the codebase is technically wrong unless it filters out soft-deleted rows. I ask myself how to make the safe path the default. A view like `active_users` that already has `WHERE deleted_at IS NULL`, or an ORM global scope, or PostgreSQL row-level security. I also remember the index: I need to replace a global `UNIQUE(email)` with a partial index `UNIQUE(email) WHERE deleted_at IS NULL` so deleted history does not block re-registration.

So before I write code I have a checklist: choose timestamp over boolean, make the UPDATE idempotent, plan the partial index, decide how to cascade to children in one transaction, and decide how reads will hide deleted rows by default.

## 3. The Solution — Fully Explained Code

The solution is grouped into the pieces you would actually ship: the column and partial index, the idempotent UPDATE, the manual cascade, and the read abstraction that prevents leaks.

**Schema and partial index — PostgreSQL.** A nullable timestamp marks deletion time. The partial unique index only enforces uniqueness where the row is still active. Multiple soft-deleted rows can share the same email, but only one active row can own it.

```sql
-- PostgreSQL: deleted_at is NULL for active rows, timestamp for deleted rows
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Only active rows participate in this unique check
CREATE UNIQUE INDEX uq_users_active_email
ON users (email)
WHERE deleted_at IS NULL;
```

**MySQL workaround — virtual generated column.** MySQL does not support `WHERE` in `CREATE INDEX`, but its `UNIQUE` index allows multiple `NULL`s. We create a generated column that is the email when active and `NULL` when deleted, then put the unique constraint there.

```sql
-- MySQL 8.0+: virtual column holds email only when active
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    active_email VARCHAR(255) GENERATED ALWAYS AS (
        IF(deleted_at IS NULL, email, NULL)
    ) VIRTUAL,
    CONSTRAINT uq_users_active_email UNIQUE (active_email)
);
```

The same idea works with a boolean flag if your schema uses it: `active_email` becomes `IF(is_deleted = 0, email, NULL)` and the soft delete becomes `SET is_deleted = 1 WHERE is_deleted = 0`.

**Idempotent single-row soft delete.** The `AND deleted_at IS NULL` makes this safe to retry and preserves the first deletion time.

```sql
-- Soft delete one user; returns 1 if you deleted it, 0 if already deleted
UPDATE users
SET deleted_at = NOW()
WHERE id = :user_id
  AND deleted_at IS NULL;
```

Why that extra predicate matters: it prevents overwriting the original `deleted_at` on a retry, it avoids a race where two workers try to delete the same user, and the row-count tells the application whether it should fire downstream side effects like sending a confirmation email.

If your table uses `is_deleted`, the identical pattern is `UPDATE users SET is_deleted = 1 WHERE id = :user_id AND is_deleted = 0`.

**Bulk soft delete with the same guard.** The pattern scales to batch operations without change.

```sql
-- Soft delete many users hired before 2020 that are still active
UPDATE users
SET deleted_at = NOW()
WHERE created_at < '2020-01-01'
  AND deleted_at IS NULL;
```

**Cascading to child tables — PostgreSQL single-statement CTE.** Foreign keys with `ON DELETE CASCADE` ignore `UPDATE`, so you cascade manually. The CTE soft-deletes the parent and then revokes child tokens using the same timestamp, in one round trip.

```sql
-- Atomically soft-delete the user and revoke their tokens
WITH target_user AS (
    UPDATE users
    SET deleted_at = NOW()
    WHERE id = :user_id
      AND deleted_at IS NULL
    RETURNING id, deleted_at
)
UPDATE user_tokens
SET revoked_at = (SELECT deleted_at FROM target_user)
WHERE user_id IN (SELECT id FROM target_user)
  AND revoked_at IS NULL;
```

**Cascading — dialect-neutral explicit transaction.** Works in PostgreSQL, MySQL, SQLite, and any engine. Run the parent and all children inside one transaction so you never leave zombie children.

```sql
BEGIN;

-- 1. soft-delete the parent
UPDATE users
SET deleted_at = NOW()
WHERE id = :user_id
  AND deleted_at IS NULL;

-- 2. cascade to tokens
UPDATE user_tokens
SET revoked_at = NOW()
WHERE user_id = :user_id
  AND revoked_at IS NULL;

-- 3. cascade to profile or owned resources
UPDATE user_profiles
SET deleted_at = NOW()
WHERE user_id = :user_id
  AND deleted_at IS NULL;

COMMIT;
```

For SQLite, replace `NOW()` with `datetime('now')`. For SQL Server, use `SYSUTCDATETIME()`.

**Transparent reads — hide deleted rows by default.** The cheapest way to prevent every developer from having to remember `WHERE deleted_at IS NULL` is to give them a default view.

```sql
-- Application code reads from this view instead of the raw table
CREATE VIEW active_users AS
SELECT id, email, full_name, created_at
FROM users
WHERE deleted_at IS NULL;

-- Now reads are safe by default
SELECT * FROM active_users WHERE email = 'alex@example.com';
```

**Row-level security — PostgreSQL.** If you want the database to enforce the filter even when someone queries the base table, enable RLS. The escape hatch `app.show_deleted_records` lets admin jobs see everything when needed.

```sql
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY hide_deleted_users ON users
FOR SELECT
USING (
    deleted_at IS NULL
    OR current_setting('app.show_deleted', true) = 'true'
);
```

In an ORM you get the same effect with a global scope. In Sequelize or Prisma, add a default `where: { deletedAt: null }` so `findMany` never returns soft-deleted rows unless you explicitly use `paranoid: false` or `includeDeleted`.

Time complexity is `O(log N)` to find the row by primary key via the B-tree, plus `O(log M)` to update the affected indexes. Space complexity is `O(1)` per row. In MVCC engines like PostgreSQL, an `UPDATE` writes a new tuple version and leaves the old one as dead, so bulk soft deletes create table and index bloat until `VACUUM` reclaims it.

## 4. Dry Run — Walk Through a Real Example

Take a concrete `users` table with a partial index and a child `user_tokens` table.

Starting state. The `users` table has one active row. The partial index `uq_users_active_email` currently holds one entry mapping `alex@example.com` to row 101 because `deleted_at IS NULL`.

```
users:
 id  | email              | full_name   | deleted_at
 101 | alex@example.com   | Alex Rivera | NULL

user_tokens:
 id | user_id | token_hash   | revoked_at
 1  | 101     | hash_abc123  | NULL
 2  | 101     | hash_def456  | NULL

partial index uq_users_active_email: { "alex@example.com" -> 101 }
```

Event 1 — User 101 requests deletion at `2026-08-26 21:50:00`. We run the CTE cascade.

First, `UPDATE users SET deleted_at = NOW() WHERE id = 101 AND deleted_at IS NULL` finds row 101. The predicate `deleted_at IS NULL` is true, so the row is updated to `deleted_at = 2026-08-26 21:50:00`. The partial index sees the row no longer satisfies `WHERE deleted_at IS NULL` and removes `alex@example.com` from its tree. The `RETURNING` clause yields `(101, 2026-08-26 21:50:00)`.

Next, `UPDATE user_tokens SET revoked_at = (SELECT deleted_at FROM target_user) WHERE user_id IN (SELECT id FROM target_user)` finds tokens 1 and 2. Both have `revoked_at IS NULL`, so both get `revoked_at = 2026-08-26 21:50:00`.

Result after Event 1: affected rows 1 for `users`, 2 for `user_tokens`. A plain `SELECT * FROM active_users` now returns zero rows for Alex, and `SELECT * FROM users WHERE deleted_at IS NULL` also returns zero. The data is still there if you query `SELECT * FROM users WHERE id = 101`.

```
users: 101 | alex@example.com | Alex Rivera | 2026-08-26 21:50:00
tokens: 1 -> revoked, 2 -> revoked
index: { }  -- empty, no active alex@example.com
```

Event 2 — A new person registers as `alex@example.com` on `2026-08-27 10:00:00`.

```sql
INSERT INTO users (email, full_name) VALUES ('alex@example.com', 'Alex New');
```

This creates row 205 with `deleted_at = NULL`. The database checks `uq_users_active_email` for a conflict among rows where `deleted_at IS NULL`. Row 101 is excluded because its `deleted_at` is not null. No conflict is found, so the insert succeeds. Both rows 101 (deleted) and 205 (active) coexist. Without the partial index, this insert would have been rejected as a duplicate.

Event 3 — A duplicate webhook retries the delete for 101.

```sql
UPDATE users SET deleted_at = NOW() WHERE id = 101 AND deleted_at IS NULL;
```

Row 101 has `deleted_at = 2026-08-26 21:50:00`, so `deleted_at IS NULL` is false. Zero rows are touched. The original timestamp is untouched. The application sees `rowCount = 0` and knows not to re-send a deletion email or re-revoke tokens.

Event 4 — A developer forgets the filter and runs `SELECT COUNT(*) FROM users`. This returns 2, counting both the deleted and the active Alex. The correct query `SELECT COUNT(*) FROM users WHERE deleted_at IS NULL` or `SELECT COUNT(*) FROM active_users` returns 1. This is exactly why the view matters — it makes the safe query the easy query.

## 5. Edge Cases — The Ones That Break Naive Solutions

**Forgetting `WHERE deleted_at IS NULL` on reads.** This is the most common production leak. A naive `SELECT * FROM users WHERE email = :email` returns a soft-deleted account and the login flow says "email already taken" or worse shows a deactivated profile in search. Every read that is supposed to show live data needs the predicate. The fix is to make the filtered path the default: query `active_users`, add an ORM default scope, or enable RLS. Code review should flag any raw `FROM users` without the filter the same way it flags a query without a `WHERE` on a large table.

**Global unique constraint blocking re-registration.** If you keep `UNIQUE(email)` on the whole table, soft-deleted history permanently occupies that email. The second Alex can never register, and the first Alex can never come back with the same address. The fix is the partial index `WHERE deleted_at IS NULL` in PostgreSQL, or the virtual `active_email` trick in MySQL, or in SQL Server a filtered index `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`. For `is_deleted` schemas use `WHERE is_deleted = 0`.

**Zombie child records.** You soft-delete the user but leave `user_tokens` alone. An auth middleware that checks only `user_tokens` without joining `users` still accepts the token. The user appears deleted but their API calls still work. The fix is to cascade inside the same transaction as shown in the solution, and to make token validation join or check `users.deleted_at IS NULL` or the token's own `revoked_at`. The same applies to subscriptions, sessions, and comments — if a child row should be considered dead when the parent is dead, update it atomically.

**Overwriting the original deletion time.** A naive `UPDATE users SET deleted_at = NOW() WHERE id = :id` without `AND deleted_at IS NULL` moves the timestamp forward on every retry. You lose when the user was actually deleted and you might re-trigger side effects. Keep the guard predicate so the first writer wins and retries are no-ops.

**Aggregation and report corruption.** `SELECT COUNT(*) FROM users` or `SELECT AVG(total) FROM orders` that ignore `deleted_at` inflate KPIs, revenue, and active-user counts with dead data. Analysts and dashboards should read from `active_users` and `active_orders` views. Treat the raw table as internal storage and the view as the public contract.

**Hard-delete versus privacy requirements.** Soft delete does not satisfy GDPR or CCPA "right to be forgotten" when the request is for erasure. Personal data still sits on disk and in backups in plain text. If the request is regulatory, either run a real `DELETE` or scrub PII while keeping the row for referential integrity:

```sql
UPDATE users
SET email = CONCAT('anon_', id, '@deleted.local'),
    full_name = 'Redacted User',
    deleted_at = NOW()
WHERE id = :user_id
  AND deleted_at IS NULL;
```

This keeps foreign keys intact but removes identifiable data.

## 6. Variations and Follow-ups

**Variation 1 — Restore (undelete).** Interviewers love to ask "how do you undo it?" You set the marker back to its alive value, but you must handle the case where the email was taken while the account was deleted.

```sql
-- Restore user 101; will fail if another active row now owns that email
UPDATE users
SET deleted_at = NULL
WHERE id = :user_id
  AND deleted_at IS NOT NULL;
```

Because of the partial index, if row 205 now holds `alex@example.com` as active, this restore throws a unique violation. Application code should catch that and prompt the user to pick a new email before completing the restore. For `is_deleted` schemas the restore is `SET is_deleted = 0 WHERE is_deleted = 1` with the same conflict handling, and you would also need to restore child rows like tokens or profiles in the same transaction.

**Variation 2 — Hard-delete expired soft-deleted rows (TTL purge).** Keeping soft-deleted rows forever bloats the table and slows sequential scans. The standard production pattern is a scheduled job that permanently deletes or archives rows that were soft-deleted more than 90 days ago, batched to avoid long locks and replication lag.

```sql
-- Purge in small batches; run from a cron job or background worker
DELETE FROM users
WHERE id IN (
    SELECT id FROM users
    WHERE deleted_at < NOW() - INTERVAL '90 days'
    LIMIT 1000
);
```

For MySQL use `NOW() - INTERVAL 90 DAY`, for SQLite use `datetime('now', '-90 days')`. Some teams instead move rows to an archive table first, then delete from the hot table — that keeps the primary table small and lets `ON DELETE CASCADE` work on the final physical delete.

```sql
BEGIN;
INSERT INTO users_archive (id, email, full_name, created_at, deleted_at)
SELECT id, email, full_name, created_at, deleted_at FROM users WHERE id = :user_id;
DELETE FROM users WHERE id = :user_id;
COMMIT;
```

**Variation 3 — Hide deleted rows with a view or default scope.** This is less a variation and more the answer to "how do you stop every engineer from forgetting the filter?" Show both the database and the application version. In SQL, expose `active_users` as above. In an ORM, add a default scope:

```sql
-- All app code reads this
CREATE VIEW active_users AS SELECT id, email, full_name, created_at FROM users WHERE deleted_at IS NULL;
```

In Prisma you would add `@@index([email])` plus a middleware that injects `deletedAt: null`, in Sequelize set `paranoid: true`, in SQLAlchemy add a `with_loader_criteria` filter. The interviewer wants to hear that you push the safety down to one place rather than relying on hundreds of developers remembering a predicate.

**Variation 4 — Bulk soft delete and reporting.** "Soft-delete everyone who has not logged in for two years" is the same UPDATE with a different `WHERE`, plus the reminder to filter reports. All dashboard queries should point at `active_users` or include `WHERE deleted_at IS NULL`, otherwise monthly active user counts will drift as dead accounts accumulate.

## 7. 🧠 The Memory Hook

Hard `DELETE` is shredding a document — it is gone. Soft delete is stamping it "ARCHIVED 2026-08-26" and filing it in a back cabinet while the front desk only shows unstamped files.

Remember it as: stamp with `deleted_at = NOW()` and guard with `WHERE deleted_at IS NULL`, enforce uniqueness only on unstamped rows with a partial index, cascade the stamp to children in one transaction, and make unstamped the default view — then shred the archived cabinets on a 90-day timer.
