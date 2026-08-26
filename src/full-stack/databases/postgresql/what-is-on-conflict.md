# What is ON CONFLICT

## 1. The Real-World Problem — When You Actually Hit This

You ship a signup endpoint. The code looks safe: first you run `SELECT * FROM users WHERE email = $1`. If nothing comes back, you run `INSERT INTO users (email) VALUES ($1)`. In development with one user clicking at a time, it always works.

Then you go live. Two requests with the same email arrive at the exact same millisecond — a user double-clicked submit, or two servers behind a load balancer handled two retries. Both requests run the SELECT at the same time. Both see "no user exists." Both try to INSERT. The second one crashes with `duplicate key value violates unique constraint "users_email_key"`. Your API returns a 500 instead of a nice "email already taken" message, your error tracker lights up, and if you catch the error badly you might even create a duplicate side-effect somewhere else.

You try to fix it with a lock in your app code, but that only works on one server. You try "just catch the error," but then you lose the ability to update the row atomically when you actually want an upsert like "insert this API key or refresh it if it already exists."

This is the moment you need `INSERT ... ON CONFLICT`. It lets Postgres handle the "what if this row already exists" decision inside one single, race-free statement, right where the unique index lives. No second query, no race window, no app-level lock.

## 2. The Analogy — Make the Mechanic Obvious

Think of a hotel front desk with a wall of mailboxes, one per room number. Each mailbox label must be unique — you cannot have two boxes for room 204.

A guest walks in and says "put this letter in box 204."

The old way — check-then-insert — is like a receptionist who first walks over, looks to see if box 204 already has a letter, walks back to the counter, then walks over again to put the new letter in. If two receptionists do that at the same time, both see an empty box, both walk back, both try to stuff a letter in, and one collides.

`ON CONFLICT` is like giving a single instruction to the mailroom clerk: "Try to put this letter in box 204. If 204 is already occupied, do this instead." The clerk does the check and the action as one atomic hand movement — no one can slip in between.

The parts map directly:

*   The wall of labeled boxes is your table with its unique index. Postgres only knows a conflict exists because of that index.
*   The label you watch — "204" — is the `conflict_target`. You must tell the clerk exactly which label to watch, and it has to be a real unique label on the wall. You cannot say "if any box looks kind of similar."
*   The letter you brought with you is the `excluded` pseudo-table. It is the row you *tried* to insert.
*   `DO NOTHING` means "if 204 is taken, just walk away quietly, leave what's there."
*   `DO UPDATE SET ...` means "if 204 is taken, open that box and update what's inside using the letter I brought."
*   The optional `WHERE` clause is "only do that update if the existing letter is old" — a guard on when to overwrite.
*   And because one clerk does check-plus-action in one go, there is no race.

## 3. The Full Explanation — How It Actually Works

`ON CONFLICT` is Postgres's name for an upsert — insert or update in one statement. It is not a separate command. It is a clause you add to `INSERT`.

The basic shape is:

```
INSERT INTO table (columns) VALUES (...)
ON CONFLICT (conflict_target) DO NOTHING
-- or
ON CONFLICT (conflict_target) DO UPDATE SET ...;
```

Postgres will try the insert. If the insert would violate a unique constraint that matches the `conflict_target`, it takes the alternative path instead of throwing an error. If there is no conflict, it just inserts normally.

There are three things you must get right, and interviews will press you on all three.

**1. The conflict_target must match a real unique index.** Postgres does not guess. You have to point at a unique constraint or unique index, otherwise it cannot detect the conflict efficiently.

You can write it three ways:

*   `ON CONFLICT (email) DO ...` — matches a unique index on `email`.
*   `ON CONFLICT (user_id, provider) DO ...` — matches a composite unique index on those two columns together.
*   `ON CONFLICT ON CONSTRAINT users_email_key DO ...` — names the constraint directly. This is safest when the constraint name is explicit.

If you write `ON CONFLICT (email)` but the table only has a unique index on `(email, org_id)`, it will not match and the insert will still throw. The target must be inferable as a unique arbiter. For partial unique indexes you also need the `WHERE` part of the index in the target: `ON CONFLICT (email) WHERE is_active` must match `CREATE UNIQUE INDEX ... ON users (email) WHERE is_active`.

**2. `excluded` is the row you tried to insert.** Inside the `DO UPDATE` you get a special pseudo-table called `excluded`. It holds the values from the `VALUES` or `SELECT` you tried to insert, as if they were already a row. You use it to say "update the existing row with the new values I brought."

`SET name = excluded.name` means "take the name from the attempted insert and write it into the existing row." `SET updated_at = now()` means "ignore what was brought and use the current time."

You can also mix them: `SET count = users.count + 1` keeps the old count and increments, while `SET count = excluded.count` would overwrite.

**3. `DO NOTHING` vs `DO UPDATE` and the optional `WHERE` guard.**

*   `DO NOTHING` silently skips the insert when there is a conflict. No error, no update. The statement succeeds and affects zero rows for that conflicting row.
*   `DO UPDATE SET ...` runs an update on the conflicting existing row instead. This is the real upsert. You must provide a `SET` list that says what to change.

Both can have a `WHERE` after them:

*   `DO NOTHING` does not take a SET, so the WHERE is rarely used there.
*   `DO UPDATE SET status = excluded.status WHERE users.is_active = true` means "only perform the update if the existing row is active." If the WHERE is false, it falls back to doing nothing for that row — even though you wrote DO UPDATE.

**Why this is race-free and the app check is not.** `SELECT then INSERT` is two round-trips. Between them any other transaction can insert the same key. To make it safe in the app you would need `SERIALIZABLE` isolation or an advisory lock, which is heavy and easy to forget. `INSERT ON CONFLICT` is one statement. Postgres checks the unique index and either inserts or branches atomically under the same row-level lock that the index would take anyway. Two concurrent inserts for the same key will serialize on that index entry — one inserts, the other hits the conflict path.

**What it costs and when to use it.** You gain correctness and one fewer round-trip, but you still pay for the unique index lookup on every insert — which you were paying anyway to enforce uniqueness. `DO UPDATE` will take a row-level lock on the existing row and fire any `BEFORE UPDATE` triggers and update indexes. Do not use it as a blind "always upsert" if you actually need to know whether you inserted or updated for business logic — you need `RETURNING` and `xmax` tricks for that. And do not use it without a matching unique index just to avoid errors — if there is no uniqueness rule, there is no conflict to catch.

## 4. See It In Practice — Real Code or Queries

All examples are real PostgreSQL. Assume this table:

```sql
-- The unique index is what makes ON CONFLICT possible
CREATE TABLE users (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  name       text NOT NULL,
  login_count int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_key UNIQUE (email)
);

-- A table with a composite unique key for later example
CREATE TABLE api_keys (
  user_id    bigint NOT NULL,
  provider   text NOT NULL,
  api_key    text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider)
);
```

**Example 1 — Insert or silently ignore (idempotent retry):**

```sql
-- If this email already exists, do nothing instead of throwing.
-- Great for retry-safe consumers and seed scripts.
INSERT INTO users (email, name)
VALUES ('aisha@example.com', 'Aisha')
ON CONFLICT (email) DO NOTHING
RETURNING id;
-- If inserted: returns the new id.
-- If conflict and DO NOTHING: returns 0 rows. Your app must handle "no row returned" — not an error.
```

**Example 2 — Real upsert: insert or update the name:**

```sql
-- excluded.name is the 'Aisha K.' we tried to insert.
INSERT INTO users (email, name, updated_at)
VALUES ('aisha@example.com', 'Aisha K.', now())
ON CONFLICT (email) DO UPDATE
  SET name = excluded.name,
      updated_at = excluded.updated_at
RETURNING id, name, xmax;
-- xmax = 0 means INSERT, xmax != 0 means UPDATE — handy when you need to know which path ran.
```

**Example 3 — Conditional update with a WHERE guard:**

```sql
-- Only overwrite if the incoming row is newer.
-- Prevents an old retry from clobbering a newer name.
INSERT INTO api_keys (user_id, provider, api_key, updated_at)
VALUES (42, 'stripe', 'sk_new_123', '2026-08-20 10:00:00+00')
ON CONFLICT (user_id, provider) DO UPDATE
  SET api_key = excluded.api_key,
      updated_at = excluded.updated_at
  WHERE api_keys.updated_at < excluded.updated_at;
-- If the existing row is newer, the WHERE is false and the update is skipped (acts like DO NOTHING for that row).
```

**Example 4 — Matching a named constraint and a partial index:**

```sql
-- When you gave the constraint an explicit name, use it. No guessing.
INSERT INTO users (email, name)
VALUES ('aisha@example.com', 'Aisha')
ON CONFLICT ON CONSTRAINT users_email_key DO NOTHING;

-- Partial unique index: only one active email at a time
CREATE UNIQUE INDEX users_email_active ON users (email) WHERE login_count > 0;

-- The conflict target must include the same WHERE to match the partial index
INSERT INTO users (email, name, login_count)
VALUES ('aisha@example.com', 'Aisha', 1)
ON CONFLICT (email) WHERE login_count > 0 DO UPDATE
  SET name = excluded.name;
```

**Example 5 — Increment pattern (not overwrite):**

```sql
-- For counters, use the existing row plus delta, not excluded alone
INSERT INTO users (email, name, login_count)
VALUES ('aisha@example.com', 'Aisha', 1)
ON CONFLICT (email) DO UPDATE
  SET login_count = users.login_count + 1,
      updated_at = now();
-- users.login_count is the current value in the table
-- excluded.login_count would be 1 (the attempted insert), which is not what you want here
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is `INSERT ON CONFLICT` and why would you use it?**

It is Postgres's single-statement upsert. You write `INSERT ... ON CONFLICT (target) DO NOTHING` or `DO UPDATE SET ...` and Postgres atomically inserts if the key is new, or takes the alternative path if the insert would violate a unique constraint matching that target. You use it to avoid the race in `SELECT then INSERT`, to make retries idempotent, and to do insert-or-update without application locks or catching duplicate-key errors in the app.

**Q: What is the difference between `DO NOTHING` and `DO UPDATE`?**

`DO NOTHING` means on conflict, skip the row silently. No error, no change, zero rows affected for that row. `DO UPDATE` means on conflict, run an update against the existing conflicting row. You must provide `SET` assignments. Use `DO NOTHING` when you want "insert if not exists" and do not care about updating. Use `DO UPDATE` when you want "insert if new, otherwise refresh the existing row" — like syncing an external feed or refreshing a token.

**Q: What is `conflict_target` and why must it match a unique index?**

The conflict_target is the `(columns)` or `ON CONSTRAINT name` you put after `ON CONFLICT`. It tells Postgres which unique violation to handle. It must match a real unique index or constraint because that is the only thing Postgres can check cheaply and unambiguously during the insert via the index. If it does not match, Postgres cannot infer the arbiter and the insert will still throw `duplicate key` instead of branching. For partial indexes, the target must also include the same `WHERE` predicate.

**Q: What is the `excluded` pseudo-table?**

Inside `DO UPDATE`, `excluded` is a special table that holds the row you attempted to insert — the values from `VALUES` or `SELECT`. It is not a real table, it only exists for that statement. You use it to reference the incoming data: `SET name = excluded.name` copies the new name into the existing row. Without `excluded` you would have no way to say "use the value I just tried to insert."

**Q: What does the `WHERE` clause do in `ON CONFLICT ... DO UPDATE`?**

There are two places a `WHERE` can appear. `ON CONFLICT ... WHERE` is part of the conflict target for partial indexes. `DO UPDATE SET ... WHERE ...` is a guard on whether to run the update at all. If that final WHERE is false for the conflicting row, the update is skipped for that row even though you wrote `DO UPDATE`. A common use is `WHERE users.updated_at < excluded.updated_at` to only apply newer data and ignore stale retries.

**Q: Why is `INSERT ON CONFLICT` safe from race conditions but `SELECT` then `INSERT` is not?**

`SELECT then INSERT` is two statements. Between them another transaction can insert the same key, so both SELECTs see nothing and both try to insert. There is a time window where the check is stale. `INSERT ON CONFLICT` is one statement. Postgres checks the unique index and does insert-or-branch while holding the necessary index lock, so two concurrent inserts for the same key serialize — the second one reliably hits the conflict path instead of crashing. No app lock needed.

**Q: What is the `RETURNING` gotcha with `DO NOTHING`?**

`RETURNING` returns rows produced by the statement. On `DO NOTHING` with a conflict, zero rows are produced — so `RETURNING id` returns nothing, not the existing id. Many apps expect an id back and then crash when they get no row. To get the existing row you need a follow-up `SELECT`, or use `DO UPDATE SET ... WHERE true` with a no-op update, or use a CTE trick. Do not assume `DO NOTHING` will return the conflicting row.

**Q: Can you use `ON CONFLICT` without a unique constraint?**

No, not usefully. If there is no unique index on the target, there is no conflict Postgres can detect, so the clause will never trigger and you may end up with duplicates. If you need upsert semantics, first create the constraint that defines what "same row" means, then write the `ON CONFLICT` to match it.

**Q: Does `DO UPDATE` fire triggers and update indexes?**

Yes. `DO UPDATE` is a real update. It fires `BEFORE UPDATE` and `AFTER UPDATE` triggers, checks `UPDATE` triggers, updates indexes, and increments `xmin`/`xmax` and `updated_at` if you set it. `DO NOTHING` fires nothing. This matters if you have audit triggers or conditional logic in triggers — `DO NOTHING` will not touch them.

## 6. The Traps — What Goes Wrong in Production

**Forgetting that the target must match the index exactly.** The most common mistake is writing `ON CONFLICT (email)` when the real unique index is on `(email, org_id)` or is partial. Postgres then throws `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Fix it by checking `\d users` or `pg_indexes` and matching the target to the actual index, or use `ON CONSTRAINT` with the exact name.

**Thinking `excluded` is the existing row.** It is the opposite. `excluded` is the new row you tried to insert. The existing row is referenced by the table name itself — `users.name` or `api_keys.updated_at`. Writing `SET name = users.name` does nothing. Writing `SET name = excluded.name` is what you meant.

**Expecting `DO NOTHING` to return the existing id.** It returns zero rows on conflict. Code that does `const { id } = await db.query(... RETURNING id)` will get `undefined` and then fail downstream with a foreign key error or a null id. Handle the empty result: fall back to `SELECT id FROM users WHERE email = $1`, or use `DO UPDATE` if you always need a returned row.

**Overwriting newer data with stale retries.** A naive `SET name = excluded.name` will clobber a newer name if an old message is retried. Always ask whether you need a `WHERE` guard like `WHERE users.updated_at < excluded.updated_at` for sync jobs and queue consumers. Without it, retries are not idempotent in the way you think.

**Using `ON CONFLICT` to paper over a missing unique constraint.** If you forgot to create the unique index, `ON CONFLICT DO NOTHING` will happily insert duplicates forever and never conflict. The fix is not better `ON CONFLICT` syntax, it is `CREATE UNIQUE INDEX` first. The constraint is the source of truth, the clause is just the handler.

**Not considering the row lock and trigger cost of `DO UPDATE`.** Under load, every conflicting insert now does an update, which takes a row lock and can contend with other writers, plus fires triggers and WAL. If you only needed to ignore duplicates, `DO NOTHING` is cheaper and causes less contention.

**Assuming it works the same in every database.** MySQL uses `INSERT ... ON DUPLICATE KEY UPDATE` and `INSERT IGNORE`, SQLite has `INSERT OR REPLACE` with different semantics, SQL Server has `MERGE`. `ON CONFLICT` is Postgres-specific syntax. Do not paste it into MySQL and expect it to run.

## 7. Compare With Related Concepts

**ON CONFLICT vs MERGE (Postgres 15+).** `MERGE` is the SQL-standard way to do insert-or-update-or-delete based on a join condition, not just a unique violation. It can say "when matched update, when not matched insert, when matched and old delete." `ON CONFLICT` is narrower: it only branches on a unique index violation during an insert, and it is usually faster and simpler for that one job. Rule: if you just need "insert this row or update it if the key exists," use `ON CONFLICT` — it is clearer, shorter, and does not need a source join. If you need to sync a whole batch with mixed insert/update/delete logic based on arbitrary conditions, use `MERGE`.

**ON CONFLICT vs manual transaction with try/catch.** The manual way is `BEGIN; INSERT; if duplicate-key error then UPDATE; COMMIT;` or `SELECT ... FOR UPDATE` then `INSERT` or `UPDATE`. This works but is more code, needs two round-trips, holds locks longer, and you have to get the error handling and retry logic right in every app. `ON CONFLICT` does the same thing in one round-trip inside the database with the minimal lock. Rule: prefer `ON CONFLICT` for single-row upserts; only drop to manual transaction handling when you need application logic between the branches that cannot be expressed in a `SET` list.

**ON CONFLICT DO NOTHING vs catching duplicate-key error in the app.** Catching `23505` (unique_violation) in the app also makes the insert safe from crashing, but you still paid for an error path — exceptions are slower, logs get noisy, and you cannot atomically update the row in the same statement. Rule: if you just want to tolerate duplicates and do nothing, both work, but `DO NOTHING` is cleaner and avoids error-handling gymnastics. If you need to update, catching the error forces a second `UPDATE` query and reintroduces a race window, while `DO UPDATE` does it atomically.

**ON CONFLICT vs INSERT IGNORE (MySQL) / INSERT OR IGNORE (SQLite).** MySQL's `INSERT IGNORE` and SQLite's `INSERT OR IGNORE` ignore *any* error, not just a specific unique constraint — including data truncation or other warnings — which can hide bugs. Postgres's `ON CONFLICT DO NOTHING` only handles the specific unique conflict you named. Rule: in Postgres, always be explicit about the target; do not reach for a "ignore all errors" pattern.

## 8. 🧠 The Memory Hook

`ON CONFLICT` is one clerk, one move: "try to insert, and if that exact unique label is already taken, do what I told you with the letter I brought." The clash is detected by a real unique index, the new letter is `excluded`, and `DO NOTHING` vs `DO UPDATE` is just "walk away" vs "open the box and rewrite it" — with no gap for anyone to race you.
