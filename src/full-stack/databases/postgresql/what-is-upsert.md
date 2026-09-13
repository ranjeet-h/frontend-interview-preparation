# What is UPSERT

## 1. The Real-World Problem — When You Actually Hit This

Your app syncs product inventory from a supplier feed. The code looks obvious: check if the product exists, if not insert it, if it does update the price.

```sql
SELECT * FROM products WHERE sku = 'A123';
-- if found: UPDATE products SET price = 29.99 WHERE sku = 'A123';
-- if not found: INSERT INTO products (sku, price) VALUES ('A123', 29.99);
```

It works perfectly on your laptop. Then you deploy. Two workers pick up the same feed message at the same time. Two API requests create the same user profile at once. A user double-clicks "save preferences." Both code paths run the SELECT at the same instant. Both see "no row." Both try to INSERT. The second one explodes:

```
ERROR: duplicate key value violates unique constraint "products_sku_key"
```

Your API returns a 500. Your job retries and tries the same broken check-then-insert again. Your error tracker fills with `23505` unique violations. If you wrap it in a naive try/catch and then UPDATE, you now have two round trips, a race window still open, and no guarantee you updated what you just tried to insert.

This is the exact moment you need an upsert — the database word for "insert or update in one go." UPSERT is not a separate command in Postgres. It is the idea of doing insert-and-if-already-there-update atomically, so there is never a gap where another transaction can race you. Postgres gives you two ways to do it: `INSERT ... ON CONFLICT` (since Postgres 9.5) for the fast, focused case, and `MERGE` (since Postgres 15) for the heavier, standard-SQL case.

## 2. The Analogy — Make the Mechanic Obvious

Think of a shared office contact board. Each card on the board has a name at the top, and the name must be unique — you cannot have two cards for "Priya."

The old way is like an intern who does this: walk to the board, look for "Priya," walk back to the desk, write a new card, walk back to the board and try to pin it. If two interns do that at the same time, both look, both see no card, both walk back, both try to pin — and the second one crashes into the first.

An upsert is a single instruction you hand to the board manager: "Take this card for Priya and put it up. If a Priya card is already there, update that card with what's on this new one instead."

The manager does the check and the pin as one hand movement. No one can slip in between.

How the parts map to Postgres:

*   The rule "one card per name" is your unique index on `sku` or `email`. Without that rule, the manager has no idea what counts as a duplicate.
*   The card in your hand is the row you tried to insert. In `ON CONFLICT`, Postgres calls it `excluded`. In `MERGE`, it is the source row you joined from.
*   `DO NOTHING` means "if Priya is already there, just throw my new card away and leave the board alone."
*   `DO UPDATE SET price = excluded.price` means "if Priya is already there, open that card and overwrite the price with the price on the card I brought."
*   A `WHERE` guard like `WHERE products.updated_at < excluded.updated_at` means "only overwrite if the card I brought is newer than the one on the board."
*   Because the manager does look-plus-act in one go, two people handing in a Priya card at the same instant are handled one after the other — one inserts, the other reliably hits the update path. No 500, no duplicate.

## 3. The Full Explanation — How It Actually Works

UPSERT is a pattern, not a keyword. It says: try to insert, and if that insert would break a uniqueness rule, do something else with that same data instead — usually update the existing row.

Postgres implements that pattern in two places. You pick based on how wide the job is.

**The workhorse: `INSERT ... ON CONFLICT`.** This is the Postgres-native upsert. You add `ON CONFLICT` to a normal `INSERT`. Postgres tries the insert. If the insert would violate a unique index or constraint that matches your `conflict_target`, it branches instead of throwing.

```sql
INSERT INTO products (sku, price, updated_at)
VALUES ('A123', 29.99, now())
ON CONFLICT (sku) DO UPDATE
  SET price = excluded.price,
      updated_at = excluded.updated_at;
```

`excluded` is a built-in alias for "the row you tried to insert but could not because it conflicted." You use it to say what from the new row should flow into the old row. For a full walkthrough of conflict targets, partial indexes, and the `excluded` pseudo-table, see [ON CONFLICT](./what-is-on-conflict.md) — that page is the companion to this one.

What makes it safe is that the check happens on the unique index entry itself, inside one statement. Postgres holds the index lock while it decides "insert or branch." Two concurrent inserts for the same `sku` will serialize on that index entry. One wins and inserts, the other sees the conflict and cleanly takes the `DO UPDATE` path. There is no stale read window like there is with a separate SELECT.

**The standard-SQL option: `MERGE` (Postgres 15+).** `MERGE` is SQL-standard and can do insert, update, and even delete in one statement based on a join between a source and your target table. It is not tied to a unique violation — it branches on whether the join finds a match.

```sql
MERGE INTO products AS target
USING (VALUES ('A123', 29.99)) AS source(sku, price)
ON target.sku = source.sku
WHEN MATCHED THEN UPDATE SET price = source.price, updated_at = now()
WHEN NOT MATCHED THEN INSERT (sku, price) VALUES (source.sku, source.price);
```

The trade-off is straightforward. `ON CONFLICT` only fires on a unique violation during an insert. It is short, fast, and obvious for "insert this one row or refresh it." `MERGE` can handle richer sync logic like "if matched and the old price is stale, update; if matched and marked deleted, delete; otherwise insert" and it can sync a whole batch from a source query in one go. But it needs a source join, it is heavier to read, and for a single-row "insert or update if key exists" it adds noise without adding safety. In Postgres, `ON CONFLICT` is almost always faster for that narrow job because it maps directly to an index check.

**What you must have before either can help.** A unique index or constraint that defines what "same row" means. If you write `ON CONFLICT (sku)` but there is no unique index on `sku`, Postgres cannot detect a conflict and you will still get duplicates or an error about a missing arbiter. The unique index is the source of truth; the upsert clause is just the handler. `MERGE` is similar — without a clear `ON` condition that maps to a unique key, you can update the wrong rows or miss matches.

**What it costs.** An upsert still does a unique index lookup on every row — the same lookup a plain insert would do to enforce uniqueness. `DO UPDATE` then takes a row-level lock on the existing row, fires any `BEFORE UPDATE` / `AFTER UPDATE` triggers, writes WAL, and updates indexes — just like a normal update. `DO NOTHING` is cheaper because it does none of that. `MERGE` can be heavier on large batches because it plans a join, and it will hold locks on matched target rows as it updates. You gain correctness and one fewer round trip versus the app-level "select, then insert or update" dance, but you do not get a free write — you get an atomic write.

**When to use which.** If your need is "ensure this single row exists and is fresh" — user settings, API keys, idempotent webhook handlers, seed scripts — use `INSERT ON CONFLICT`. If your need is "sync this whole batch from an outside feed, inserting new rows, updating changed ones, and maybe deleting stale ones based on rules" — that is where `MERGE` earns its keep. And if neither fits because you need business logic between the branches that cannot be expressed in a `SET` list, then you fall back to an explicit transaction with careful error handling, not to the race-prone SELECT-then-INSERT.

## 4. See It In Practice — Real Code or Queries

All queries are real PostgreSQL. Start with a table that has a real unique rule — that rule is what makes upsert possible.

```sql
CREATE TABLE products (
  id         bigserial PRIMARY KEY,
  sku        text NOT NULL,
  price      numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_sku_key UNIQUE (sku)
);

CREATE TABLE products_staging (
  sku   text NOT NULL,
  price numeric NOT NULL
);
```

**Single-row upsert — insert or update the price:**

```sql
-- If sku A123 is new, it inserts.
-- If A123 already exists, it overwrites price and timestamp atomically.
INSERT INTO products (sku, price, updated_at)
VALUES ('A123', 29.99, now())
ON CONFLICT (sku) DO UPDATE
  SET price = excluded.price,
      updated_at = excluded.updated_at
RETURNING id, price, xmax;
-- xmax = 0 means INSERT happened; xmax != 0 means UPDATE happened.
-- Use RETURNING when your app needs to know which path ran.
```

**Idempotent insert — insert or silently ignore:**

```sql
-- Great for retry-safe workers and seed scripts that may run twice.
INSERT INTO products (sku, price)
VALUES ('A123', 29.99)
ON CONFLICT (sku) DO NOTHING
RETURNING id;
-- On conflict, DO NOTHING returns 0 rows.
-- Your app must handle "no row returned" — it is not an error, it is just skipped.
```

**Conditional overwrite — only apply newer data:**

```sql
-- Prevents an old retry from clobbering a newer price.
INSERT INTO products (sku, price, updated_at)
VALUES ('A123', 24.99, '2026-08-10 10:00:00+00')
ON CONFLICT (sku) DO UPDATE
  SET price = excluded.price,
      updated_at = excluded.updated_at
  WHERE products.updated_at < excluded.updated_at;
-- If the existing row is newer, the WHERE is false
-- and this row is left alone (acts like DO NOTHING for that row).
```

**Bulk upsert — the pattern you actually use for feeds and syncs:**

```sql
-- Option A: multi-row VALUES — simple and fast for hundreds to low thousands of rows.
INSERT INTO products (sku, price)
VALUES ('A123', 29.99), ('B456', 49.99), ('C789', 9.99)
ON CONFLICT (sku) DO UPDATE
  SET price = excluded.price,
      updated_at = now();
-- One round trip, one statement, every row upserted atomically.
-- Each conflicting row runs the DO UPDATE independently.

-- Option B: stage then upsert — best for large batches (tens of thousands+).
-- Load raw feed data into a staging table first, then upsert in bulk.
INSERT INTO products_staging (sku, price)
VALUES ('A123', 29.99), ('B456', 49.99);

INSERT INTO products (sku, price, updated_at)
SELECT sku, price, now() FROM products_staging
ON CONFLICT (sku) DO UPDATE
  SET price = excluded.price,
      updated_at = excluded.updated_at;
-- Keeps the VALUES list small, avoids huge query strings,
-- and lets you deduplicate or validate in staging before the upsert.

-- Option C: upsert with deduplication in the source.
-- If the feed itself contains duplicates, collapse them so ON CONFLICT sees one row per key.
INSERT INTO products (sku, price, updated_at)
SELECT DISTINCT ON (sku) sku, price, now()
FROM products_staging
ORDER BY sku, price DESC
ON CONFLICT (sku) DO UPDATE
  SET price = excluded.price,
      updated_at = excluded.updated_at;
```

**The same bulk job with `MERGE` (Postgres 15+) — when you need mixed logic per row:**

```sql
-- MERGE lets you update, insert, and delete in one pass based on the join.
-- Here we sync staging into products, updating price when matched and inserting when not.
MERGE INTO products AS target
USING (SELECT sku, price FROM products_staging) AS source
ON target.sku = source.sku
WHEN MATCHED AND target.price IS DISTINCT FROM source.price THEN
  UPDATE SET price = source.price, updated_at = now()
WHEN NOT MATCHED THEN
  INSERT (sku, price, updated_at) VALUES (source.sku, source.price, now());

-- MERGE can also delete stale rows in the same statement:
MERGE INTO products AS target
USING (SELECT sku FROM products_staging) AS source
ON target.sku = source.sku
WHEN NOT MATCHED BY SOURCE THEN
  DELETE;
-- That last line removes products no longer in the feed — something ON CONFLICT cannot do alone.
-- For a plain "insert or update each row" job, ON CONFLICT is simpler and usually faster.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is an upsert in PostgreSQL?**

An upsert is "insert or update in one atomic statement" — try to insert a row, and if a uniqueness rule would be broken, update the existing row instead. In Postgres you do it with `INSERT ... ON CONFLICT (target) DO UPDATE` for the focused case, or with `MERGE` (Postgres 15+) when you need a richer join-based sync. It exists to eliminate the race in application code that does a SELECT to check, then an INSERT or UPDATE, where two concurrent requests can both see "no row" and then collide.

**Q: How does `ON CONFLICT DO UPDATE` differ from `MERGE`?**

They solve the same family of problems but from different angles. `ON CONFLICT` branches only on a unique constraint violation during an insert. You say "try to insert this row; if this specific unique index would be broken, update the conflicting row instead." It is narrow, fast, and needs only the row you are inserting. `MERGE` branches on a join condition between a source and a target: "for each source row, if it matches a target row, do this; if not matched, do that; if target has no source, optionally do a third thing." It can update, insert, and delete in one statement with different guards per branch, which makes it the right tool for batch syncs with mixed rules. For a single "insert or refresh this key," `ON CONFLICT` is clearer and usually faster because it does an index check rather than planning a join. For a nightly feed that must insert new SKUs, update changed prices, and remove stale SKUs, `MERGE` fits better. You can mix them — use `ON CONFLICT` for hot-path single-row idempotent writes and `MERGE` for bulk reconciliation.

**Q: What is `excluded` and how is it different from the source in `MERGE`?**

Inside `ON CONFLICT DO UPDATE`, `excluded` is the row you tried to insert. It is not a real table — it only exists for that statement — and it holds the values from your `VALUES` or `SELECT`. You write `SET price = excluded.price` to mean "copy the price from the row I just tried to insert into the existing row." In `MERGE`, there is no `excluded`. The incoming data is the source you joined, usually aliased as `source`. You write `SET price = source.price`. Confusing the two is a common bug: `SET price = products.price` does nothing because `products` is the existing row you are updating, not the new one.

**Q: Why does an upsert need a unique index? What happens without one?**

Because the database has to know what "same row" means. The unique index is the arbiter that lets Postgres detect a conflict cheaply during the insert. If there is no unique constraint on the columns you upsert on, `ON CONFLICT (sku)` will error with "there is no unique or exclusion constraint matching the ON CONFLICT specification" — or worse, if you omit the target or the index is on different columns, it will silently insert duplicates and never conflict. The fix is always at the schema level first: `CREATE UNIQUE INDEX` or `CONSTRAINT ... UNIQUE` on the real key, then write the upsert to match it. `MERGE` has the same need — if the `ON` condition is not backed by a unique key, you can match multiple target rows or miss matches and corrupt data.

**Q: How do you bulk upsert efficiently?**

Do not loop single-row upserts from the app — that is many round trips and many index checks. Send one statement for the whole batch. For a few hundred to a few thousand rows, a multi-row `INSERT ... VALUES (...), (...), ... ON CONFLICT DO UPDATE` in one round trip is simple and fast. For larger batches, load the feed into a staging table (or a `VALUES` subquery), deduplicate the source on the key with `DISTINCT ON`, and then upsert from `SELECT ... FROM staging ON CONFLICT DO UPDATE` — this keeps query size small and lets you validate before touching the target. If you need per-row branching like "update some, insert some, delete stale ones," use `MERGE INTO target USING staging ON ... WHEN MATCHED THEN UPDATE WHEN NOT MATCHED THEN INSERT`. Keep the batch sized to your memory and timeout limits; chunking 10k–50k rows at a time is common in production.

**Q: How can you tell whether an upsert inserted or updated?**

With `ON CONFLICT` and `RETURNING`, inspect `xmax`. A fresh insert has `xmax = 0`. An update done by the `DO UPDATE` path sets `xmax` to the updating transaction, so it comes back non-zero. So `INSERT ... ON CONFLICT DO UPDATE ... RETURNING id, xmax` tells you which path ran per row. With `DO NOTHING`, there is a different trap: on conflict it returns zero rows, so you cannot tell "it was already there" unless you follow up with a SELECT. `MERGE` can use `RETURNING merge_action()` in Postgres 15+ or you can add a discriminator column to the source to know the branch. Either way, do not assume an upsert always returns a row — plan for the "skipped" case.

**Q: Why is `SELECT then INSERT` unsafe even inside a transaction?**

Because the SELECT and the INSERT are two statements, and between them any other transaction can insert the same key. Even at `READ COMMITTED`, both transactions can read "no row," both try to insert, and the second one gets a unique violation. You would need `SERIALIZABLE` isolation, `SELECT ... FOR UPDATE` on a parent row, or an advisory lock to make the manual path safe — all of which are heavier and easy to forget. `INSERT ON CONFLICT` and `MERGE` are single statements, so Postgres checks and writes under the same index lock and serializes concurrent writers for that key without app-level locking.

## 6. The Traps — What Goes Wrong in Production

**No unique index, so upsert never fires.** The number one trap. You write `ON CONFLICT (email) DO UPDATE` but the table only has a unique index on `(email, org_id)` or has no unique constraint at all. Postgres throws an arbiter error, or silently inserts duplicates forever and the upsert logic never runs. Always verify with `\d tablename` or by querying `pg_indexes`. Name the constraint explicitly with `ON CONFLICT ON CONSTRAINT your_name` when you can — it removes all guessing.

**Silent overwrites that clobber newer data.** A plain `SET price = excluded.price` will overwrite whatever is there, even if the incoming row is stale. A retry of an old queue message or a slow feed file can drag a corrected price backwards. Fix it with a guard: `WHERE target.updated_at < excluded.updated_at` for `ON CONFLICT`, or `WHEN MATCHED AND target.updated_at < source.updated_at THEN UPDATE` for `MERGE`. Decide what "newer" means for your domain and enforce it in the SQL, not just in the app.

**Expecting `DO NOTHING` to give you the existing row.** It does not. `RETURNING` after `DO NOTHING` returns zero rows on conflict, so code that does `const { id } = result.rows[0]` gets undefined and then fails with a foreign key error downstream. If you need the id regardless of whether it was new or existing, either use `DO UPDATE SET sku = excluded.sku` as a no-op update so a row is always returned, or follow the `DO NOTHING` with a `SELECT id FROM products WHERE sku = $1`.

**Bulk upsert without deduplicating the source.** If your `VALUES` list or staging table contains two rows with the same `sku` but different prices, Postgres will upsert them one by one and the final value is whichever duplicate it processes last — often non-deterministic. Deduplicate first with `DISTINCT ON (sku)` ordered by the freshest timestamp, or aggregate the source before the upsert. Do not let the feed's duplicates become a coin flip.

**Oversized single-statement bulk upserts.** Sending 200,000 rows as one giant `VALUES (...), (...), ...` statement bloats the query string, blows past memory or timeout limits, and makes a single failure roll back everything. Chunk the work: load into a staging table or use `UNNEST` arrays, then upsert in batches of a few thousand with a transaction per batch so failures are isolated and progress is observable.

**Trigger, index, and lock cost hiding under `DO UPDATE`.** Every conflicting row under `DO UPDATE` is a real update — it fires `BEFORE UPDATE` / `AFTER UPDATE` triggers, updates indexes, and takes a row lock that can contend with other writers. Under high concurrency, that contention can become the bottleneck and your audit triggers may fire far more often than expected. If you only needed to tolerate duplicates and not refresh the row, `DO NOTHING` avoids all of that. And remember `MERGE` holds locks on matched target rows too — do not think it is lock-free just because it is one statement.

**Forgetting that `ON CONFLICT` is Postgres-specific.** MySQL uses `ON DUPLICATE KEY UPDATE`, SQLite has `ON CONFLICT` but also `REPLACE` with delete-then-insert semantics, SQL Server has `MERGE` with slightly different syntax. Do not paste `ON CONFLICT DO UPDATE SET` into MySQL and expect it to run. If you support multiple databases, isolate the upsert into a database-specific query builder or use an ORM that abstracts it.

## 7. Compare With Related Concepts

**Upsert via `ON CONFLICT` vs `MERGE`.** `ON CONFLICT` is the narrow, fast handler for "insert this row, or update it if the key already exists." It only branches on a unique violation and you write the update with `excluded`. `MERGE` is the broad, standard-SQL sync that branches on a join condition and can insert, update, and delete with different guards. Rule: if the job is "ensure this one row is fresh," use `ON CONFLICT`. If the job is "reconcile this whole feed against the table with per-row branching," use `MERGE`.

**Upsert vs plain `INSERT` with app-level try/catch on `23505`.** Catching `unique_violation` in the app also prevents a crash, but you still paid for an error path — noisy logs, slower exception handling, and you cannot update the row atomically without a second `UPDATE` that reintroduces a race window. Upsert does the insert-or-update in one round trip without ever entering the error path. Rule: use a real upsert for any write that must be idempotent or race-free; use error catching only as a safety net, not as the plan.

**`ON CONFLICT DO NOTHING` vs `INSERT IGNORE` (MySQL) / `INSERT OR IGNORE` (SQLite).** MySQL's `INSERT IGNORE` and SQLite's `OR IGNORE` swallow *any* error, including type mismatches and truncation warnings, which can hide bugs. Postgres's `DO NOTHING` is precise — it only skips on the specific unique conflict you named. Rule: in Postgres, always name the conflict target. Do not reach for a "ignore all errors" pattern when you can name the exact duplicate.

**`ON CONFLICT` vs a transaction that does `SELECT FOR UPDATE` then `INSERT` or `UPDATE`.** The manual transaction works but holds locks longer, needs more round trips, and pushes correctness into application code that every caller must get right. `ON CONFLICT` does the same work inside one statement with the minimal index lock and without relying on every service to remember the locking dance. Rule: prefer `ON CONFLICT` or `MERGE` for upserts; drop to manual transactions only when you need business logic between reading and writing that cannot be expressed as a `SET` list.

## 8. 🧠 The Memory Hook

Upsert is the board manager's one-move rule: without a real unique label on the board, there is no clash to catch — and with it, one instruction means "pin it if the slot is empty, or rewrite the card I brought if it is not," so two hands reaching for the same slot never collide.
