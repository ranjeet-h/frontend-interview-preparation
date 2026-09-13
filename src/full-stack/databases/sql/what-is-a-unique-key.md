# What Is a Unique Key

## 1. The Real-World Problem — When You Actually Hit This

A support ticket lands on your desk. A user says password reset is broken. You dig in and find the truth: she has two accounts with the same email. She reset the password on the dead one, logged into nothing, and now there's an order attached to one account and a refund request attached to the other. Support merges the accounts by hand while marketing keeps sending emails to both.

How did this happen? The app had a check — `SELECT` the email first, insert only if it's not there. But that check ran in application code, and application code has gaps. Two requests from a double-clicked submit button raced each other. Both SELECTs found nothing. Both INSERTs succeeded. Multiply that by a year of traffic, plus one manual row someone pasted in via a database console, and you have duplicate accounts everywhere.

The fix was one line of schema: a rule telling the database itself that no two rows may share the same email. That rule is a **unique key**. The lesson behind it is bigger than the syntax: any guarantee you enforce only in application code will eventually be violated, because requests race, scripts bypass the app, and humans run SQL directly. A unique key moves the guarantee into the one place that sees every write.

## 2. The Analogy — Make the Mechanic Obvious

Think of a hotel front desk with one alphabetical ledger of guests.

The hotel has a promise: no two current guests register under the same email address. That promise is the **unique constraint** — the declared rule.

The ledger itself is kept sorted alphabetically by email. That sorted ledger is the **unique index** — the physical structure doing the work. When a new guest checks in, the clerk doesn't read the whole book front to back. She flips straight to the right page — a few turns, even with ten thousand names — checks the two neighbors, and either writes the name in or refuses check-in: "someone with this email is already here." That refusal, delivered instantly, is the duplicate-key error.

Two more details of the desk map perfectly to real behavior:

First, guests who never gave an email get a blank line. If three guests all left the email field empty, did they register under "the same email"? No — they registered under *nothing*. Blank isn't a value, so blanks never conflict. That's exactly how `NULL` works in most databases. (One grumpy chain — SQL Server — insists blank counts as a name everyone shares, so only one blank line is allowed. More on that soon.)

Second, the hotel never throws old registration cards away — checkout just marks the card "departed." A guest returns two years later and tries to register with her old email. Blocked! Her departed card is still sitting in the ledger claiming that email. The card isn't a current guest, but the ledger doesn't know which promises apply to ghosts. The fix at the hotel would be a second ledger that only lists currently checked-in guests. In the database, that's a partial unique index — and it's the standard fix for soft deletes.

## 3. The Full Explanation — How It Actually Works

In plain words first: a unique key is a rule attached to a column (or a group of columns) saying no two rows may carry the same combination of values there. The moment any write would break that rule — insert, update, bulk load, migration script, anything — the database rejects the write with an error. It doesn't matter where the write came from. That's the whole superpower: the guarantee lives below your application code.

Now the machinery. Every mainstream relational engine enforces a unique key using a sorted structure called a B-tree index. Keeping values sorted means checking for a duplicate is fast — a handful of comparisons regardless of whether the table holds a thousand rows or a billion — and it means lookups are fast too. So when you declare `email` unique, you get two things at once: enforcement on every write, and a free high-speed access path for queries like `WHERE email = ?`. Your login lookup rides the exact structure the constraint uses for policing.

This is why the terms blur together. In PostgreSQL, adding a unique constraint automatically creates a unique B-tree index — the docs say so plainly. In MySQL, `UNIQUE KEY`, `UNIQUE INDEX`, and `UNIQUE` are literally synonyms; you cannot have one without the other. In SQL Server, a unique constraint is backed by a unique index too. So when an interviewer asks "what's the difference between a unique constraint and a unique index?", the honest senior answer is: the constraint is the declaration of intent in your schema, the index is the mechanism, and in every major engine they are the same object — dropping one drops the other.

The `NULL` question needs precision, because engines genuinely disagree. Standard SQL defines `NULL` as "no value," and no-value is not equal to anything, not even another no-value. So most engines — PostgreSQL, MySQL/InnoDB, SQLite, Oracle — happily store unlimited `NULL`s in a unique column. Two profiles without a GitHub handle don't conflict, because neither *has* a handle. SQL Server breaks ranks: its unique indexes treat `NULL`s as equal, so you get exactly one `NULL` per column unless you use a filtered index (`WHERE col IS NOT NULL`) to scope the rule. PostgreSQL 15+ lets you pick either behavior explicitly with `UNIQUE NULLS NOT DISTINCT`. Knowing this split cold is a genuine interview separator.

Uniqueness also scales sideways to combinations. `UNIQUE (review_id, user_id)` means the *pair* must be unique — the same user appears many times across reviews, and each review has many voters, but no user votes twice on one review. This tuple uniqueness is how join tables express "once and only once" relationships, and it's one of the most common real-world uses of the feature.

Where does this show up in production? Everywhere correctness depends on something happening at most once: emails and usernames, URL slugs, country codes, join-table pairs, coupon redemptions (`UNIQUE (coupon_id, user_id)`), and idempotency keys on payment endpoints (`UNIQUE (idempotency_key)`), where the constraint is literally what makes a retried charge safe. Foreign keys can reference any unique column set, not just the primary key — sometimes a natural unique business identifier is the right join target.

The costs are real but modest: every write touching the column must update the sorted tree (extra work, extra storage), and hot random inserts scatter writes across the index instead of appending neatly. What you buy is correctness you cannot accidentally bypass plus fast lookups on the column. Don't double-pay by adding a plain index on the same column — the unique index already serves those queries.

One interaction bites almost every team eventually: soft delete. If you "delete" users by setting `deleted_at = now()`, the row stays, so its unique email still blocks re-registration. The fix — a partial unique index scoped to live rows — is important enough that it gets its own example below, plus a trap section entry, because the naive workaround people reach for silently removes the protection entirely.

## 4. See It In Practice — Real Code or Queries

The baseline: declare intent with a named constraint, because you'll see that name in error messages, logs, and migrations.

```sql
-- PostgreSQL
CREATE TABLE users (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT users_email_unique UNIQUE (email)
);

-- Proof that the constraint IS an index:
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users';
-- users_email_unique | CREATE UNIQUE INDEX users_email_unique ON public.users USING btree (email)
```

Watch the rule fire, and watch `NULL` slip past it:

```sql
INSERT INTO users (email) VALUES ('ana@example.com');
INSERT INTO users (email) VALUES ('ana@example.com');
-- ERROR: duplicate key value violates unique constraint "users_email_unique"
-- SQLSTATE 23505 (the standard code for a unique violation)

-- Nullable unique columns behave differently:
CREATE TABLE profiles (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  display_name  TEXT,
  github_handle TEXT UNIQUE   -- not everyone has linked GitHub
);

INSERT INTO profiles (display_name, github_handle) VALUES ('Ana', 'ana-dev');
INSERT INTO profiles (display_name, github_handle) VALUES ('Bo', NULL);
INSERT INTO profiles (display_name, github_handle) VALUES ('Cy', NULL);
-- Fine in PostgreSQL / MySQL / SQLite: NULL is "no value", so NULLs can't equal each other.
```

SQL Server disagrees about `NULL`, and gives you the filtered-index escape hatch:

```sql
-- SQL Server: NULLs count as EQUAL in unique indexes...
CREATE TABLE profiles (
  id            INT IDENTITY PRIMARY KEY,
  github_handle NVARCHAR(100)
);
ALTER TABLE profiles ADD CONSTRAINT uq_profiles_github UNIQUE (github_handle);
INSERT INTO profiles (github_handle) VALUES (NULL); -- ok
INSERT INTO profiles (github_handle) VALUES (NULL); -- FAILS: duplicate NULL

-- ...so scope the rule to real values only:
CREATE UNIQUE INDEX uq_profiles_github_live
  ON profiles (github_handle)
  WHERE github_handle IS NOT NULL;
```

Tuple uniqueness — one vote per user per review:

```sql
-- Assumes users(id) and reviews(id) exist
CREATE TABLE review_votes (
  id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  review_id BIGINT NOT NULL REFERENCES reviews(id),
  user_id   BIGINT NOT NULL REFERENCES users(id),
  vote      SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  CONSTRAINT uq_vote_once UNIQUE (review_id, user_id)
);
```

The soft-delete collision and the proper fix:

```sql
-- PostgreSQL
ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ;

UPDATE users SET deleted_at = now() WHERE id = 42;          -- "delete" Ana
INSERT INTO users (email) VALUES ('ana@example.com');
-- ERROR 23505 again: her ghost row still owns the email.

-- Fix: enforce uniqueness among LIVE rows only.
-- Drop the blanket constraint first, or it keeps blocking.
ALTER TABLE users DROP CONSTRAINT users_email_unique;
CREATE UNIQUE INDEX users_email_live_unique
  ON users (email)
  WHERE deleted_at IS NULL;

-- Now: one live account per email, unlimited deleted rows, reusable emails.
-- Bonus: login queries (WHERE email = $1 AND deleted_at IS NULL) hit this index.
```

MySQL has no partial indexes, so use the nullable-flag trick — and note it only works because `NULL`s escape the pair rule:

```sql
-- MySQL 8
ALTER TABLE users ADD COLUMN alive TINYINT NULL DEFAULT 1;
ALTER TABLE users ADD UNIQUE KEY uk_users_email_alive (email, alive);

-- Soft delete parks the row outside the rule:
UPDATE users SET alive = NULL WHERE id = 42;
-- Live rows hold (email, 1): duplicates properly rejected.
-- Deleted rows hold (email, NULL): NULLs are distinct, so ghosts never collide
-- with each other or with a fresh signup. Verified behavior, not folklore.
```

Finally, the application side — catch the violation and speak HTTP, and prefer atomic upserts over check-then-insert:

```js
// Node + pg (PostgreSQL). The DB threw the error; we translate it for the client.
try {
  const { rows } = await db.query(
    'INSERT INTO users (email) VALUES ($1) RETURNING id',
    [email],
  );
  return res.status(201).json({ id: rows[0].id });
} catch (err) {
  if (err.code === '23505') {           // SQLSTATE unique_violation
    return res.status(409).json({ error: 'Email already registered' });
  }
  throw err;                            // anything else is a real bug — surface it
}
// MySQL drivers: check err.code === 'ER_DUP_ENTRY' (errno 1062) instead.
```

```sql
-- Atomic "insert if missing" — no race window at all (PostgreSQL):
INSERT INTO users (email) VALUES ('ana@example.com')
ON CONFLICT (email) DO NOTHING;

-- With the partial index, name the predicate so Postgres finds it:
INSERT INTO users (email) VALUES ('ana@example.com')
ON CONFLICT (email) WHERE deleted_at IS NULL DO NOTHING;

-- MySQL equivalent — careful: INSERT IGNORE also swallows unrelated errors
-- like data truncation, so prefer explicit error handling for signups.
INSERT IGNORE INTO users (email) VALUES ('ana@example.com');
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a unique key, in one breath — and how is it different from a primary key?**

It's a database-level rule that no two rows may carry the same value(s) in the chosen column(s), enforced on every write by a unique index, and it usually doubles as a fast lookup path. The difference from a primary key: a table has exactly one primary key and it identifies the row — implicitly NOT NULL, typically the thing foreign keys point at. Unique keys are extra guarantees about business facts — emails, slugs, vote pairs — and a table can have many. Primary keys answer "which row is this?"; unique keys answer "what may happen at most once?" Also mention the NULL asymmetry: primary key columns can't hold NULL ever; unique columns can, subject to engine rules.

**Q: Can a unique column contain multiple NULLs?**

Yes in most engines, no in SQL Server — and being precise here signals seniority. Standard SQL says NULL is not equal to anything including another NULL, so PostgreSQL, MySQL/InnoDB, SQLite, and Oracle allow unlimited NULLs in a unique column: three profiles without a GitHub handle aren't duplicates because none of them *has* a handle. SQL Server treats NULLs as equal in unique indexes, so only one NULL survives — the workaround is a filtered unique index with `WHERE col IS NOT NULL`. PostgreSQL 15+ makes it a choice: `UNIQUE NULLS NOT DISTINCT` opts into SQL Server-style behavior when your domain actually wants "at most one unknown."

**Q: Is a unique constraint different from a unique index?**

In practice, no — they're the same object wearing two names. The constraint is the declarative statement in your schema ("this invariant matters"); the unique index is the B-tree that enforces it and serves lookups. PostgreSQL creates a unique index automatically for every unique constraint; MySQL treats `UNIQUE KEY` and `UNIQUE INDEX` as literal synonyms; SQL Server backs constraints with unique indexes too. Consequence: dropping the constraint drops the index, and you can't keep a constraint without paying index write costs. The only place the distinction gets practical is partial coverage — a partial/filtered unique index exists purely as an index definition with a WHERE clause, which table-constraint syntax can't express.

**Q: We soft-delete users with a deleted_at timestamp. Why does signing up with an old email fail after deletion, and how do you fix it?**

Because soft delete doesn't remove the row — it labels it. The unique index doesn't care about labels; it still sees `(ana@example.com)` occupying its slot, so re-registration violates the constraint. The fix is to scope the rule to live rows: drop the blanket unique constraint, then create a partial unique index — `CREATE UNIQUE INDEX ... ON users (email) WHERE deleted_at IS NULL` (SQL Server: filtered index with the same WHERE). Now one live account per email, unlimited tombstones, emails become reusable after deletion. MySQL lacks partial indexes, so the standard trick is a nullable flag: `UNIQUE (email, alive)` where `alive` is 1 while the row lives and NULL once deleted — live rows collide correctly, and NULLs being distinct lets tombstones pile up harmlessly. Critical follow-up I'd volunteer: do NOT just widen the key to `UNIQUE (email, deleted_at)` — since deleted_at is NULL on live rows and NULLs are distinct, two live rows with the same email stop colliding entirely. The guard disappears precisely where you need it.

**Q: How should an API handle a unique violation?**

Catch the driver-specific error code and translate it into an honest 409 Conflict with user-facing copy — `23505` for Postgres-family via SQLSTATE, `ER_DUP_ENTRY` (1062) for MySQL. Never let it bubble up as a 500, because "something went wrong" for a predictable outcome destroys trust and pages your on-call for nothing. Equally important: treat the constraint as the source of truth, not a backup. Check-then-insert has a race window where two concurrent requests both pass the SELECT; one wins the insert, the other gets the violation, and your handler turns that into a clean 409. For flows where "already there, fine" is acceptable — idempotent webhooks, payment retries keyed by idempotency key — skip the round trip entirely with `ON CONFLICT DO NOTHING` (Postgres) or `ON DUPLICATE KEY UPDATE` (MySQL), making detect-and-skip atomic.

**Q: Can uniqueness span multiple columns, and when would I want that?**

Yes — a composite unique key constrains the combination, not the parts. `UNIQUE (review_id, user_id)` allows the same reviewer on thousands of reviews and thousands of reviewers on one review, but rejects the same pairing twice. Reach for it whenever the thing that must happen at most once is a relationship: one vote per user per review, one enrollment per student per course, one redemption per user per coupon. Common mistake to avoid: declaring separate uniques on both columns — that would cap the whole table at one vote total, which is a much stronger and wrong rule.

**Q: Does a unique key affect performance?**

Both directions. Cost: every insert and every update touching the column must modify the sorted B-tree — extra writes, extra pages, some cache pressure versus a plain append. Benefit: queries filtering on that column get O(log n) lookups for free, because the enforcing structure *is* the lookup structure. For an email column that's a huge win — login-by-email rides the constraint's index. Two operational corollaries worth saying out loud: never add a second plain index on the same column, it's pure duplication; and building a unique index on a large live table needs care — `CREATE UNIQUE INDEX CONCURRENTLY` in PostgreSQL avoids blocking writes (and requires a dedupe pass first, or the build fails on existing duplicates), while MySQL 8 does it online via INPLACE but still through a potentially long build.

**Q: How would you test uniqueness behavior?**

Integration tests against a real database engine — never a mocked one, since NULL multiplicity and violation codes are exactly the things mocks fake badly. Three cases minimum: a direct duplicate insert raises the expected error and maps to a 409 contract; a soft-deleted row's email can be reused while a second live account cannot be created; and a concurrency test firing N parallel inserts of the same email expects exactly one success and N−1 clean violations — that last test is what catches teams who "fixed" duplicates with only an application-level check. Add a migration test on a copy of production data before introducing a new constraint on an old table, because legacy rows love to already contain the duplicates you're forbidding.

**Q: What would you monitor around unique keys in production?**

Track the rate of unique-violation errors per constraint (Postgres exposes them in `pg_stat_database` as conflicts, and structured logs carry the constraint name). A steady background hum of 23505s on a signup endpoint is normal — bots and double-clicks. A sudden spike means something changed: a retry storm hitting a non-idempotent endpoint, a broken client resubmitting forms, or a deploy that removed an upsert. Alert on the spike and on 409-rate anomalies per route. Also monitor failed migrations mentioning constraint names — a unique-index build failing midway on prod-size data is a classic Friday-evening incident.

## 6. The Traps — What Goes Wrong in Production

**"I SELECT first, then INSERT — I'm safe."** The assumption is that checking then writing is one operation. It's two, and between them another request can insert the same value; both pass the check, one insert fails late, and without a handler that failure becomes a raw 500. The window is tiny but traffic makes it certain. What actually saves you: the unique constraint catching what the check couldn't, plus your 409 handler (or an atomic `ON CONFLICT`). Application checks improve UX with friendlier errors; the database rule is the actual guarantee.

**"NULL behaves the same everywhere."** Teams porting a schema from Postgres to SQL Server discover the hard way that "unlimited NULLs in a unique column" quietly became "exactly one," and the third profile without a GitHub link starts throwing duplicate-key errors nobody can explain. Why: SQL Server compares NULLs as equal inside unique indexes; Postgres/MySQL/SQLite compare NULLs as distinct. Fix on SQL Server: filtered unique index with `WHERE col IS NOT NULL`. On modern Postgres, choose deliberately with `NULLS NOT DISTINCT` if you actually want single-unknown semantics.

**"Soft delete frees the email."** It feels intuitive — the user is "gone," the email should be available. But the row remains, the index still contains the email, and the next signup with it crashes. Fix: partial unique index scoped with `WHERE deleted_at IS NULL` (drop the blanket constraint first), or MySQL's nullable-flag composite trick. Remember the login query must filter `deleted_at IS NULL` anyway, so the partial index serves your real reads too.

**"`UNIQUE (email, deleted_at)` fixes soft delete."** This is the trap hiding inside the previous fix, and it's nasty because it looks right and tests green. Walk the logic: live rows have `deleted_at = NULL`, and NULLs are distinct — so two live rows with the same email form the pairs `(a@x, NULL)` and `(a@x, NULL)`, which the engine happily accepts together. The guard evaporates exactly for the case it exists to prevent. I verified this on SQLite: both live-row inserts succeed. Use the partial index or the nullable-flag approach; never widen the key with the nullable timestamp.

**"The database will tell my users nicely."** The database tells your *driver* nicely — `duplicate key value violates unique constraint` — and unless you intercept it, your framework wraps it in a 500, the user sees "unexpected error," and your error tracker fills with a foreseeable event. Fix: map violation codes per driver (`23505` / `ER_DUP_ENTRY`) to 409 with copy like "That email already has an account — try logging in." One handler function covers every unique constraint you'll ever add.

**"Constraints are free."** Each unique index adds write amplification (every affected insert/update maintains the tree), storage, and migration risk on big tables. People who forget this sprinkle uniques speculatively onto low-cardinality columns like status or timestamps — where duplicates are legitimate anyway — and pay write cost for a rule that fires constantly and helps no read. Rule of thumb: unique keys belong on identity and on "happens at most once" facts. Everything else is just an index candidate, maybe.

## 7. Compare With Related Concepts

**Unique key vs primary key.** A primary key is the row's official identity: exactly one per table, implicitly NOT NULL, the default target of foreign keys, and often the physical clustering anchor (InnoDB stores rows in primary-key order; SQL Server clusters by PK by default). A unique key protects a business fact and you can stack many per table; NULLability follows engine rules. They overlap mechanically — both are enforced by unique B-tree indexes — but their jobs differ. One-line rule: the primary key answers "who is this row"; a unique key answers "what may happen at most once."

**Unique key vs composite key.** Composite describes shape (multiple columns), unique describes the promise (no repeated values) — they combine freely. `PRIMARY KEY (tenant_id, order_id)` makes the pair the identity; `UNIQUE (review_id, user_id)` makes the pair a once-only fact; and a composite unique leaves room for additional unique facts on the same table. One-line rule: if the thing that must not repeat is a pairing, constrain the pair — constraining each column separately states a much stronger and usually wrong rule.

**Unique key vs foreign key.** Easy to confuse because both are constraints, opposite jobs: unique says "values in this column stay distinct within my table"; foreign says "values in this column must exist over there." They connect more than people realize — a foreign key can target any unique column set, not only the primary key, which is how you reference a natural business identifier. One-line rule: unique looks inward for exclusivity; foreign looks outward for existence.

## 8. 🧠 The Memory Hook

A unique key is a bouncer with a sorted guest list: every newcomer gets checked in milliseconds, exact matches get bounced, and lookups ride the same list for free. Remember the two asterisks — "no answer" (NULL) is not a shared name, except at SQL Server's desk — and ghosts (soft-deleted rows) keep holding their seat until your index counts only the living.
