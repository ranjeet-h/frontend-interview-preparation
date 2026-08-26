# Write a Query to Soft Delete Records in SQL: Pattern, Partial Indexes, and Cascade Handling

## 1. What the Interviewer Is Really Testing

On the surface, this problem looks trivial: *"Instead of `DELETE FROM users WHERE id = 1`, write an `UPDATE users SET ...` query."* A junior engineer writes a single update statement in five seconds and stops.

In a senior interview, soft deletion is a trap door into database architecture and system design. The interviewer is evaluating whether you understand the ripple effects that occur across your entire database schema the moment you stop using hard deletes:

1. **Schema Design Tradeoffs (`is_deleted BOOLEAN` vs `deleted_at TIMESTAMP NULL`):** Why a boolean flag destroys auditability and complicates point-in-time recovery, whereas a nullable timestamp preserves the exact deletion instant, supports data retention policies (TTL purges), and aligns with SQL `NULL` indexing semantics.
2. **The Unique Constraint Trap:** If your `users` table has a `UNIQUE(email)` constraint and user `alice@example.com` deletes their account, a standard unique constraint blocks Alice (or anyone else) from ever registering `alice@example.com` again. You must understand partial/conditional unique indexes and database-specific workarounds.
3. **The Broken Cascade Invariant:** Foreign keys with `ON DELETE CASCADE` only fire on physical SQL `DELETE` statements. They completely ignore `UPDATE` statements. You must explain how to cascade soft deletes across one-to-many relationships (like revoking tokens, cancelling subscriptions, or hiding child comments) atomically.
4. **Query Ergonomics, Leaks, and Table Bloat:** Every query in the codebase now needs `WHERE deleted_at IS NULL`. If a junior developer forgets this filter on a single endpoint, you leak deleted user data or show deactivated records in public search. A senior engineer knows how to use Database Views, Row-Level Security (RLS), or ORM global query scopes to prevent human error, alongside vacuuming strategies for MVCC table bloat.

---

## 2. Think Before You Code — The Senior Dev Thought Process

When an interviewer asks how to implement soft deletes, here is the architectural mental model to walk through:

### 1. Identify the Core Invariants and Pitfalls
- **Idempotency:** If a webhook or user double-clicks "Delete Account", the first request sets `deleted_at = NOW()`. The second request must not overwrite that original timestamp with a newer timestamp or trigger duplicate downstream side-effects.
- **Uniqueness among active records only:** We want email uniqueness enforced strictly for active accounts (`deleted_at IS NULL`), while permitting infinite historical soft-deleted records with the same email.
- **Relational consistency:** Soft deleting a parent row leaves child rows in an ambiguous "zombie" state unless child records are updated or filtered in lockstep within the same transaction.

### 2. Formulating the Solution Layers
- **Layer 1: Schema & Constraints.** Use `deleted_at TIMESTAMPTZ DEFAULT NULL`. Replace global unique constraints with partial unique indexes (`WHERE deleted_at IS NULL`).
- **Layer 2: DML Soft Delete Query.** Write an idempotent `UPDATE` that filters on `deleted_at IS NULL` and returns affected rows.
- **Layer 3: Relational Cascade.** Group parent and child soft updates into a single atomic transaction or a PostgreSQL writable Common Table Expression (CTE).
- **Layer 4: Access Abstraction.** Implement a database view or Row-Level Security (RLS) policy so downstream application queries default to active records automatically.

```txt
┌─────────────────────────────────────────────────────────────┐
│                    Incoming Soft Delete                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
            ┌──────────────────────────────────────┐
            │  UPDATE users                        │
            │  SET deleted_at = NOW()              │
            │  WHERE id = :id                      │
            │    AND deleted_at IS NULL            │
            └──────────────────┬───────────────────┘
                               │
            ┌──────────────────┴───────────────────┐
            │ Atomic Cascade                       │
            ▼                                      ▼
┌─────────────────────────┐            ┌──────────────────────┐
│ UPDATE user_tokens      │            │ UPDATE user_profiles │
│ SET revoked_at = NOW()  │            │ SET deleted_at = NOW│
│ WHERE user_id = :id     │            │ WHERE user_id = :id  │
└─────────────────────────┘            └──────────────────────┘
```

---

## 3. The Solution — Fully Explained Code

### Step 1: Schema Definition & Partial Unique Indexing

Standard unique constraints enforce uniqueness across all rows in the table. We replace that with a **Partial (Conditional) Unique Index** that applies only to active records.

#### PostgreSQL (Native Partial Index)
```sql
-- Create users table with nullable timestamp
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Partial index: uniqueness is checked ONLY when deleted_at IS NULL.
-- Multiple soft-deleted rows can share 'alice@example.com', but only ONE active row can have it.
CREATE UNIQUE INDEX uq_users_active_email
ON users (email)
WHERE deleted_at IS NULL;
```

#### MySQL 8.0+ Workaround (Virtual Generated Column)
MySQL does not support `WHERE` clauses inside `CREATE INDEX`. However, MySQL's `UNIQUE` index allows multiple `NULL` values. We exploit this by generating a virtual column that holds the email when active, and `NULL` when soft deleted:

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    
    -- Virtual generated column: holds email if active, NULL if deleted
    active_email VARCHAR(255) GENERATED ALWAYS AS (
        IF(deleted_at IS NULL, email, NULL)
    ) VIRTUAL,
    
    -- Standard unique constraint on the virtual column
    CONSTRAINT uq_users_active_email UNIQUE (active_email)
);
```

---

### Step 2: Idempotent Single-Row Soft Delete

```sql
-- Soft delete a specific user idempotently
UPDATE users
SET deleted_at = NOW()
WHERE id = :user_id
  AND deleted_at IS NULL;
```

**Why `AND deleted_at IS NULL` is critical:**
- **Idempotency:** If the query runs twice, the second run updates `0` rows instead of overwriting the original deletion timestamp with a new time.
- **Race Condition Prevention:** Prevents concurrent processes from modifying a record that was already decommissioned.
- **Return Status:** Checking the affected row count immediately tells the application whether this call performed the deletion (`1`) or if the user was already deleted (`0`).

---

### Step 3: Cascading Soft Delete Across Child Relations

Because database foreign key cascades do not trigger on `UPDATE`, child rows must be soft deleted in the same transaction.

#### Option A: PostgreSQL Writable CTE (Single Statement)
```sql
-- Atomically soft-delete the user and revoke all active auth tokens in one trip
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

#### Option B: Dialect-Neutral Explicit Transaction
```sql
BEGIN;

-- 1. Soft delete the parent record
UPDATE users
SET deleted_at = NOW()
WHERE id = :user_id
  AND deleted_at IS NULL;

-- 2. Cascade soft-delete / revoke child records
UPDATE user_tokens
SET revoked_at = NOW()
WHERE user_id = :user_id
  AND revoked_at IS NULL;

-- 3. Cascade to user profile or user-owned resources
UPDATE user_profiles
SET deleted_at = NOW()
WHERE user_id = :user_id
  AND deleted_at IS NULL;

COMMIT;
```

---

### Step 4: Transparent Read Isolation (Views and RLS)

To eliminate the human error of forgetting `WHERE deleted_at IS NULL` on every `SELECT` query, abstract the filter at the database layer.

#### Pattern 1: Database View
```sql
-- Standard read view used by default in application queries
CREATE VIEW active_users AS
SELECT id, email, full_name, created_at
FROM users
WHERE deleted_at IS NULL;
```

#### Pattern 2: PostgreSQL Row-Level Security (RLS)
```sql
-- Enable Row Level Security on the base table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enforce that standard queries automatically filter out soft-deleted records
CREATE POLICY hide_deleted_users ON users
FOR SELECT
USING (
    deleted_at IS NULL
    OR current_setting('app.show_deleted_records', true) = 'true'
);
```

---

### Complexity and Cost Analysis

- **Time Complexity:**
  - Finding the record: $O(\log N)$ via Primary Key B-Tree index lookup.
  - Updating the record: $O(1)$ page modification + $O(\log M)$ index update cost for modified indexes.
- **Space Complexity:** $O(1)$ auxiliary memory per update.
- **Storage Engine Impact (MVCC):** In engines like PostgreSQL (MVCC), an `UPDATE` does not modify data in-place; it inserts a new tuple version and marks the old tuple as dead. Soft deleting millions of records causes table and index bloat until `VACUUM` or background cleanup runs.

---

## 4. Dry Run — Walk Through a Real Example

Let's trace how the schema, constraints, and queries behave during user lifecycle events.

### Initial Database State

**`users` table:**
| id | email | full_name | created_at | deleted_at |
| :--- | :--- | :--- | :--- | :--- |
| `101` | `alex@example.com` | Alex Rivera | `2026-01-10 09:00:00` | `NULL` |

**`user_tokens` table:**
| id | user_id | token_hash | revoked_at |
| :--- | :--- | :--- | :--- |
| `1` | `101` | `hash_abc123` | `NULL` |
| `2` | `101` | `hash_def456` | `NULL` |

**Partial Index `uq_users_active_email` Index Entries:**
- `'alex@example.com'` $\rightarrow$ Pointer to row `101` (since `deleted_at IS NULL`).

---

### Step-by-Step Execution

#### Event 1: User 101 requests account deletion at `2026-08-26 21:50:00`
We execute the cascading soft delete CTE:
1. `UPDATE users` executes with `id = 101 AND deleted_at IS NULL`.
2. Row `101` gets `deleted_at = '2026-08-26 21:50:00'`.
3. The partial index `uq_users_active_email` detects that row `101` now has `deleted_at IS NOT NULL`. It removes `'alex@example.com'` from the active unique index tree.
4. The CTE passes `id = 101` to `user_tokens`. Tokens `1` and `2` get `revoked_at = '2026-08-26 21:50:00'`.
5. **Result:** Affected row count = `1`.

#### Event 2: A new user registers with `alex@example.com` at `2026-08-27 10:00:00`
We execute:
```sql
INSERT INTO users (email, full_name, created_at)
VALUES ('alex@example.com', 'Alex New', NOW());
```
1. Insert creates row `205` with `email = 'alex@example.com'` and `deleted_at = NULL`.
2. The database evaluates `uq_users_active_email` on row `205`.
3. The index checks active rows (`WHERE deleted_at IS NULL`). Row `101` is ignored because its `deleted_at` is set. No conflicting active entry exists.
4. **Result:** Insertion succeeds! Both row `101` (deleted) and row `205` (active) coexist safely in the same table.

#### Event 3: Duplicate webhook calls soft delete for user 101
We execute:
```sql
UPDATE users SET deleted_at = NOW() WHERE id = 101 AND deleted_at IS NULL;
```
1. Database checks row `101`. `deleted_at` is already `'2026-08-26 21:50:00'`.
2. The `AND deleted_at IS NULL` predicate evaluates to `FALSE`.
3. **Result:** 0 rows modified. The original deletion timestamp remains untouched.

---

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. The Global Unique Constraint Lockout
- **The Trap:** Defining `CONSTRAINT uq_email UNIQUE (email)` globally across the entire table.
- **What Breaks:** Once a user soft-deletes their account, neither they nor any other user can ever create an account with that email again.
- **The Fix:** Always use a partial index (`WHERE deleted_at IS NULL` in Postgres) or a virtual generated nullable column in MySQL.

### 2. The Zombie Child Record Bug
- **The Trap:** Updating `users.deleted_at = NOW()` without updating child tables.
- **What Breaks:** If an authentication service checks `user_tokens` without joining `users`, an active token belonging to a soft-deleted user still grants API access.
- **The Fix:** Perform soft delete cascades in a single atomic transaction, or ensure child lookups validate parent liveness via joins or denormalized `deleted_at` propagation.

### 3. Aggregation and Analytics Corruption
- **The Trap:** Running standard aggregate queries like `SELECT COUNT(*) FROM users;` or `SELECT AVG(order_total) FROM orders;`.
- **What Breaks:** Inactive, soft-deleted accounts and cancelled test records artificially inflate KPI metrics, revenue numbers, and active user counts.
- **The Fix:** Direct all general business reporting through sanitized Views (`active_users`, `active_orders`) or enforce RLS policies.

### 4. GDPR / CCPA "Right to Be Forgotten" Non-Compliance
- **The Trap:** Assuming soft deleting a record satisfies legal data deletion requests.
- **What Breaks:** Personally Identifiable Information (PII) still resides in plain text on production storage and database backups. Regulators can levy severe fines.
- **The Fix:** If an account deletion is requested under privacy regulations, either execute an actual `DELETE`, or run a PII scrubbing update:
```sql
UPDATE users
SET email = CONCAT('anon_', id, '@deleted.local'),
    full_name = 'Redacted User',
    deleted_at = NOW()
WHERE id = :user_id;
```

---

## 6. Variations and Follow-ups

### Variation 1: The 90-Day Hard Purge (TTL Cleanup)

In high-throughput systems, keeping soft-deleted records forever bloats table pages and degrades sequential scans. A standard production pattern is a background job that permanently purges or archives records soft-deleted more than 90 days ago.

```sql
-- Batch-delete in chunks to avoid long table locks and replication lag
DELETE FROM users
WHERE id IN (
    SELECT id
    FROM users
    WHERE deleted_at < NOW() - INTERVAL '90 days'
    LIMIT 1000
);
```

### Variation 2: Soft Delete via Dedicated Archive Table

Instead of keeping dead rows inside the hot transactional table, move them to an archive table. This preserves historical data while keeping the primary table compact and fast.

```sql
BEGIN;

-- 1. Copy record to the archive table
INSERT INTO users_archive (id, email, full_name, created_at, deleted_at)
SELECT id, email, full_name, created_at, NOW()
FROM users
WHERE id = :user_id;

-- 2. Physically delete from the hot table (native ON DELETE CASCADE now works!)
DELETE FROM users
WHERE id = :user_id;

COMMIT;
```

### Variation 3: Restoring a Soft-Deleted Record ("Undelete")

Restoring a record requires reversing `deleted_at` back to `NULL`, but introduces a potential unique constraint conflict if another user claimed that email during the deletion window.

```sql
-- Attempt to restore user record
UPDATE users
SET deleted_at = NULL
WHERE id = :user_id
  AND deleted_at IS NOT NULL;
```
*If another active user registered with the same email while this user was soft-deleted, the partial unique index will reject this restore with a unique violation error, prompting the application to ask the user to choose a new email.*

---

## 7. 🧠 The Memory Hook

> **"Soft delete is an UPDATE in disguise: use `deleted_at TIMESTAMPTZ`, index with a partial `WHERE`, cascade manually in a transaction, and purge with a 90-day TTL."**

Remember the three pillars:
1. **Timestamp > Boolean:** Timestamps tell you *when* and enable TTL policies.
2. **Partial Index > Full Unique:** A partial index on active rows prevents the re-registration lockout.
3. **Manual Cascade:** Foreign keys ignore updates; you must cascade across child tables inside an explicit transaction.
