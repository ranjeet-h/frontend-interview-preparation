# What Is Expression Index

## 1. The Real-World Problem — When You Actually Hit This

Your users table has been fine for months. You have an index on `email`, login is fast, everything is good. Then product says login should be case-insensitive — `Test@Example.com` and `test@example.com` should be the same person. So you change the login query to `WHERE LOWER(email) = LOWER($1)`. It works, tests pass, you ship it.

Two weeks later, with two million users, login starts taking 600 milliseconds. Your dashboard lights up. You run `EXPLAIN ANALYZE` and see `Seq Scan on users` — PostgreSQL is reading every single row, lowercasing every email on the fly, and then comparing. Your B-tree index on `email` is sitting right there, completely unused. You built an index on the raw value, but your query no longer asks for the raw value. It asks for a computed value, and you have no index on that computation.

That is the exact moment you need an expression index. Without it, every query that wraps a column in a function — `LOWER()`, `COALESCE()`, `date_trunc()`, `price * quantity` — falls back to a full scan at scale, no matter how many normal indexes you have.

## 2. The Analogy — Make the Mechanic Obvious

Think of a library catalog.

The library has a big card catalog sorted alphabetically by book title exactly as typed: "The Great Gatsby", "the great gatsby" (lowercase t) would be in a different drawer because capital letters sort differently. Normally if someone asks for "The Great Gatsby" spelled exactly that way, the librarian walks straight to the right drawer and finds it instantly. That is a normal index on `title`.

Now someone walks in and says: "I don't care about capitals, just find me any book where the title, when you lowercase everything, equals 'the great gatsby'." The librarian cannot use the original catalog anymore. That catalog is sorted by the exact stored spelling. To answer a lowercased question using that catalog, she would have to pull every single card, lowercase it in her head, and then check. That is a sequential scan.

So the library builds a second catalog. This time, before filing each card, a staff member lowercases the title first and then files it in sorted order by that lowercased value. The card still points to the same shelf, but the sorting key is no longer the raw title — it is the result of `LOWER(title)`.

Now the lowercased question is instant again. The librarian goes straight to the "the great gatsby" drawer in the second catalog.

A few rules of this second catalog map directly to how PostgreSQL works:

The catalog only helps if the question matches exactly. If you built a catalog sorted by `LOWER(title)` and someone asks for `TRIM(LOWER(title))` or `UPPER(title)`, the librarian cannot use it. The computation has to be letter-for-letter the same as what you filed. Close is not good enough. That is the exact-match requirement.

You can only file things that give the same result every time. If you tried to build a catalog sorted by "title plus today's weather" or "title plus a random number," the filing would be different every day and the catalog would be useless tomorrow. PostgreSQL refuses to build that kind of catalog at all. That is the IMMUTABLE requirement — only functions that always return the same output for the same input can be indexed.

And the catalog has a cost. Every time a new book arrives, someone has to lowercase the title and file two cards instead of one. Writes get a little slower, the catalog takes up shelf space. That is the write and storage trade-off of any expression index.

## 3. The Full Explanation — How It Actually Works

In plain words, an expression index is an index that does not store the column as-is. It stores the result of a calculation on that column, and then sorts and searches by that result.

In PostgreSQL you create it like this: `CREATE INDEX ON users (LOWER(email))`. Notice the extra parentheses — `LOWER(email)` is an expression, not a column name. PostgreSQL evaluates `LOWER(email)` for every row, stores those lowercased values in a B-tree (by default), and keeps that B-tree sorted and maintained just like a normal index. The index entry still points to the original row in the table.

When a query comes in, the planner does not try to be clever and reverse-engineer your intent. It looks at the `WHERE` clause and asks a very literal question: "Do I have an index whose defining expression matches exactly what this query is asking for?" If your index is `LOWER(email)` and your query says `WHERE LOWER(email) = 'test@example.com'`, it matches, and the planner can do an index scan on the precomputed lowercased values. If your query says `WHERE email = 'test@example.com'` or `WHERE LOWER(TRIM(email)) = 'test@example.com'`, it does not match, and the index is invisible to that query.

This exact-match rule is the single most important thing to understand. PostgreSQL does not know that `LOWER(email)` and `email ILIKE 'test@example.com'` are logically related. It only matches identical expression trees. Even `LOWER(email)` and `lower(email)` match because PostgreSQL lowercases function names, but `LOWER(email)` and `LOWER(email::text)` might not if the types differ.

The second critical rule is the IMMUTABLE requirement. PostgreSQL will only let you index an expression built from IMMUTABLE functions — functions that are guaranteed to return the same result forever for the same inputs. `LOWER`, `UPPER`, `COALESCE`, `date_trunc` with constant arguments, arithmetic like `(price * quantity)`, and `SUBSTRING` are all immutable. `NOW()`, `CURRENT_TIMESTAMP`, `random()`, and most user-defined functions that default to VOLATILE are not. If you try `CREATE INDEX ON events (NOW() - created_at)`, PostgreSQL will reject it with an error about functions needing to be immutable. This protects you: an index has to stay correct without being recomputed on every read, so the expression result must be stable.

If you have a function that is logically immutable but PostgreSQL does not know it yet — like a custom `normalize_phone(text)` function you wrote — you must declare it `IMMUTABLE` when you create it. Otherwise PostgreSQL will refuse to use it in an index even though you know it is safe. Declaring a truly volatile function as immutable to trick PostgreSQL will corrupt your index silently, so do not lie to the database.

Under the hood, there is nothing magical. The B-tree for an expression index looks identical to a B-tree for a normal column. The only difference is what value was inserted into the tree. That means all the normal B-tree behaviors apply: it supports equality, range scans, and ordering by that expression. An index on `(price * quantity)` can answer `WHERE (price * quantity) > 1000` with a range scan. An index on `(date_trunc('day', created_at))` can answer grouping by day.

The trade-offs are real and you should be able to state them in an interview. On the read side, you get index-speed lookups for queries that previously needed full scans. On the write side, every `INSERT` and `UPDATE` that touches a column used in the expression must evaluate the expression and update the index, so writes are slightly slower and generate more WAL. On the storage side, the index takes disk space proportional to the number of rows and the size of the computed value. PostgreSQL also needs statistics on the expression to plan well, which it collects automatically, but you can help it with `ANALYZE` after creating the index on a large table.

Expression indexes compose well with other PostgreSQL features. You can make a unique expression index — `CREATE UNIQUE INDEX ON users (LOWER(email))` — and now the database enforces case-insensitive uniqueness for you at the storage level, not just in application code. You can make a partial expression index — `CREATE INDEX ON orders (LOWER(status)) WHERE status IS NOT NULL` — to keep the index smaller when you only care about a subset of rows. And you can combine them: the most common production pattern is a partial unique expression index.

You do not use expression indexes for everything. If your query does not wrap the column in a function, a normal index is simpler and cheaper. If you need case-insensitive search with wildcards like `%test%`, a B-tree on `LOWER(email)` will not help with the leading wildcard — you would want a trigram GIN index instead. Choose the index shape that matches the actual query shape you run.

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL SQL. You can run them as-is in `psql`.

Start with a realistic table and the slow query that triggers the problem.

```sql
-- A typical users table
CREATE TABLE users (
  id         bigserial PRIMARY KEY,
  email      text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Normal index on the raw column. Helps email = 'x' but not LOWER(email) = 'x'.
CREATE INDEX idx_users_email ON users (email);

-- Case-insensitive login query. Looks innocent, but cannot use idx_users_email.
EXPLAIN ANALYZE
SELECT * FROM users WHERE LOWER(email) = LOWER('Test@Example.COM');
-- Seq Scan on users  (cost=... rows=1)  Filter: (lower(email) = 'test@example.com')
-- Execution time with 2M rows: hundreds of milliseconds to seconds
```

Now create the expression index and watch the plan change.

```sql
-- The fix: index the computed value, not the raw column.
-- The double parentheses are required: the inner ones are the function call,
-- the outer ones tell PostgreSQL this is an expression, not a column list.
CREATE INDEX idx_users_lower_email ON users (LOWER(email));

-- Same query, now fast. Note the predicate matches the index expression exactly.
EXPLAIN ANALYZE
SELECT * FROM users WHERE LOWER(email) = LOWER('Test@Example.COM');
-- Index Scan using idx_users_lower_email on users
--   Index Cond: (lower(email) = 'test@example.com')
-- Execution time: < 1ms with warm cache, even at 2M rows

-- You can also enforce case-insensitive uniqueness so application
-- race conditions cannot insert Test@Example.com and test@example.com as two rows.
CREATE UNIQUE INDEX idx_users_lower_email_unique ON users (LOWER(email));
-- Now INSERT INTO users(email) VALUES ('TEST@example.com') will fail
-- if 'test@example.com' already exists.
```

The exact-match rule in action — these queries look similar but only one uses the index.

```sql
-- Uses the index: expression matches exactly
SELECT * FROM users WHERE LOWER(email) = 'test@example.com';

-- Does NOT use the index: different expression (extra TRIM)
SELECT * FROM users WHERE LOWER(TRIM(email)) = 'test@example.com';

-- Does NOT use the index: different expression (ILIKE is not LOWER)
SELECT * FROM users WHERE email ILIKE 'test@example.com';

-- Does NOT use the index: even though logically equivalent, the planner
-- only matches identical expression trees
SELECT * FROM users WHERE LOWER(email) LIKE 'test@example.com';

-- To make the second query fast, you would need a separate index on that exact expression:
CREATE INDEX idx_users_lower_trim_email ON users (LOWER(TRIM(email)));
```

More production patterns beyond lowercasing. Each one solves a specific query shape.

```sql
-- 1. Computed amount: find expensive orders without storing a generated column
CREATE TABLE orders (
  id       bigserial PRIMARY KEY,
  price    numeric NOT NULL,
  quantity int NOT NULL
);

CREATE INDEX idx_orders_total ON orders ((price * quantity));
-- Now this uses an index instead of computing price*quantity for every row:
SELECT * FROM orders WHERE (price * quantity) > 1000;

-- 2. Date truncation: daily grouping and filtering
CREATE TABLE events (
  id         bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL
);

CREATE INDEX idx_events_day ON events ((date_trunc('day', created_at)));
-- Fast daily lookup:
SELECT * FROM events WHERE date_trunc('day', created_at) = '2026-03-15'::date;

-- 3. JSONB expression: index a field inside a JSON document
CREATE TABLE profiles (
  id   bigserial PRIMARY KEY,
  data jsonb NOT NULL
);

CREATE INDEX idx_profiles_country ON profiles (((data ->> 'country')));
-- Query that matches exactly:
SELECT * FROM profiles WHERE (data ->> 'country') = 'IN';

-- 4. COALESCE for queries that treat NULL as a default value
CREATE INDEX idx_users_coalesce_nickname ON users ((COALESCE(nickname, email)));
SELECT * FROM users WHERE COALESCE(nickname, email) = 'test@example.com';

-- 5. Partial expression index: only index active users, keep it small
CREATE INDEX idx_users_lower_email_active
  ON users (LOWER(email)) WHERE deleted_at IS NULL;
-- Only helps queries that include the same WHERE clause:
SELECT * FROM users WHERE LOWER(email) = 'a@b.com' AND deleted_at IS NULL;
```

The IMMUTABLE requirement — what PostgreSQL allows and what it rejects.

```sql
-- This works because LOWER is IMMUTABLE: same input always gives same output
CREATE INDEX idx_ok ON users (LOWER(email));

-- This fails: NOW() is STABLE (changes within a transaction), not IMMUTABLE
-- ERROR: functions in index expression must be marked IMMUTABLE
CREATE INDEX idx_bad ON events ((NOW() - created_at));

-- This also fails: random() is VOLATILE (different every call)
-- ERROR: functions in index expression must be marked IMMUTABLE
CREATE INDEX idx_bad2 ON users ((email || random()::text));

-- If you write a custom function, you must declare it IMMUTABLE to use it in an index.
-- Only do this if it truly is immutable — lying will corrupt the index.

CREATE OR REPLACE FUNCTION normalize_email(text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT LOWER(TRIM($1)) $$;

-- Now this is allowed, and queries must match the function call exactly:
CREATE INDEX idx_users_normalized ON users (normalize_email(email));
SELECT * FROM users WHERE normalize_email(email) = normalize_email(' Test@Example.COM ');
```

How to verify the index is actually being used and maintained.

```sql
-- Check which indexes exist and their definitions
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'users';

-- See if the planner considers the index (without executing)
EXPLAIN SELECT * FROM users WHERE LOWER(email) = 'a@b.com';

-- Check index size and write cost
SELECT pg_size_pretty(pg_relation_size('idx_users_lower_email'));
SELECT relname, n_tup_ins, n_tup_upd FROM pg_stat_user_tables WHERE relname = 'users';
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is an expression index in PostgreSQL?**

An expression index is an index built on the result of an expression or function call, not on the raw column value. When you write `CREATE INDEX ON users (LOWER(email))`, PostgreSQL computes `LOWER(email)` for each row and builds a B-tree on those computed values. Any query whose `WHERE` or `ORDER BY` uses that exact same expression can then do an index scan instead of evaluating the function on every row at query time. The easiest way to think about it is: you are precomputing the function output and indexing the answer, so reads do not have to recompute it.

**Q: Why can't a normal index on `email` speed up `WHERE LOWER(email) = 'test@example.com'`?**

Because a B-tree index is sorted by the exact value it stores. An index on `email` is sorted by `email` with case sensitivity — `'Test@Example.com'` and `'test@example.com'` are in different positions in the tree. When you query `LOWER(email)`, you are asking for rows sorted by a different key than what the index contains. PostgreSQL would have to apply `LOWER()` to every entry to know if it matches, which defeats the purpose of the tree. It is faster to just scan the table. An expression index on `LOWER(email)` is sorted by the lowercased value, so the lookup is a direct tree traversal again.

**Q: Does the query have to match the index expression exactly?**

Yes, exactly. PostgreSQL matches the expression tree, not the logical meaning. `LOWER(email)` will not match `LOWER(TRIM(email))`, `UPPER(email)`, `email ILIKE 'x'`, or even `LOWER(email::text)` if the cast changes the type. `LOWER(email) = 'test@example.com'` matches `CREATE INDEX ON users (LOWER(email))`, but `LOWER(email) LIKE 'test%'` is a different operator and may need a different index type like trigram. If you find your expression index is not being used, the first thing to check is whether the query expression is character-for-character the same as the index definition, which you can verify with `pg_indexes`.

**Q: What does IMMUTABLE mean and why does PostgreSQL require it?**

PostgreSQL labels every function as IMMUTABLE, STABLE, or VOLATILE. IMMUTABLE means the function will always return the same output for the same inputs, forever, regardless of database state or time. `LOWER`, `COALESCE`, arithmetic — all immutable. STABLE means it returns the same result within a single statement but can change across statements, like `NOW()`. VOLATILE means it can return a different result every time you call it, like `random()`. An index has to stay correct without being rebuilt on every read, so PostgreSQL only allows immutable expressions in indexes. If you indexed `NOW() - created_at`, the indexed value would be stale a second later. PostgreSQL rejects that at `CREATE INDEX` time to prevent a silently wrong index.

**Q: Can I create a unique constraint that is case-insensitive?**

Yes, and this is one of the best uses of expression indexes. A normal `UNIQUE` on `email` allows both `test@example.com` and `Test@Example.com` as separate rows because they are different strings. `CREATE UNIQUE INDEX ON users (LOWER(email))` enforces that no two rows can have the same email when lowercased. It acts as a case-insensitive unique constraint. There is no `UNIQUE(LOWER(email))` syntax for the table constraint — you create it as a unique index and PostgreSQL enforces it the same way.

**Q: What are the performance trade-offs?**

You trade write speed and disk space for read speed on that specific query pattern. Reads that match the expression go from sequential scan to index scan, which is often 100x to 1000x faster at scale. But every `INSERT` and `UPDATE` that touches a column in the expression must evaluate the expression and update the B-tree, which adds a few microseconds per write and more WAL traffic. The index itself consumes disk roughly proportional to the number of rows times the size of the computed value. For a table with heavy writes and rare reads on that expression, the cost may not be worth it. For a login path that runs lowercased lookups on every authentication, it absolutely is.

**Q: How do I know if my expression index is being used?**

Run `EXPLAIN` or `EXPLAIN ANALYZE` on the query and look for `Index Scan using your_index_name` or `Index Only Scan` if the index covers the query. If you see `Seq Scan` instead, either the expression does not match exactly, the table is small enough that PostgreSQL thinks a scan is cheaper, or statistics are stale and you need `ANALYZE`. You can also query `pg_stat_user_indexes` to see `idx_scan` counts over time. In production, the most common reason an expression index appears unused is a mismatch — the index is `LOWER(email)` but the application sends `LOWER(TRIM(email))`.

**Q: Can I combine expression indexes with partial indexes?**

Yes, and you should when only a subset of rows need the index. `CREATE INDEX ON users (LOWER(email)) WHERE deleted_at IS NULL` creates an expression index that only includes active users. It is smaller, faster to update, and only used when the query also contains `WHERE deleted_at IS NULL` alongside the expression. This is a very common production pattern: a partial unique expression index like `CREATE UNIQUE INDEX ON users (LOWER(email)) WHERE deleted_at IS NULL` lets you allow soft-deleted duplicates while enforcing uniqueness among active rows.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Creating `LOWER(email)` index but querying `email = $1` and expecting it to be used.**

What people do wrong: they create `CREATE INDEX ON users (LOWER(email))` and then keep the login query as `WHERE email = LOWER($1)` or just `WHERE email = $1` with the application lowercasing the input. They assume PostgreSQL will realize the lowercased input plus the lowercased index means a match.

Why it is wrong: `email = 'test@example.com'` and `LOWER(email) = 'test@example.com'` are different expressions. The first asks for the raw value, the second asks for the computed value. The planner does not normalize one into the other.

What actually happens: the query does a sequential scan or uses the old raw index if one exists, but never the expression index. You paid the write cost for an index that no query hits.

The fix: make the query predicate match the index definition exactly — `WHERE LOWER(email) = LOWER($1)` — or create the raw index if you need both query shapes. Check with `EXPLAIN` every time you create an expression index.

**Trap 2: Trying to index a non-immutable function and getting a confusing error.**

What people do wrong: they try `CREATE INDEX ON sessions ((NOW() - last_seen))` or use a custom function that was created without `IMMUTABLE`, and get `ERROR: functions in index expression must be marked IMMUTABLE`.

Why it is wrong: `NOW()` returns a different value every second, so an index built today would point to wrong positions tomorrow. PostgreSQL correctly refuses. For custom functions, PostgreSQL defaults to VOLATILE, so even a pure function like `LOWER(TRIM(x))` wrapped in your own SQL function will be rejected unless you explicitly mark it immutable.

What actually happens: the `CREATE INDEX` fails, or worse, someone marks a truly volatile function as `IMMUTABLE` to silence the error and the index silently returns wrong results after the underlying data or time changes.

The fix: only use genuinely immutable logic in expression indexes. If you need time-relative queries, index the raw timestamp and query with a range like `WHERE last_seen > NOW() - interval '1 hour'`. For custom functions, declare `IMMUTABLE` only when the function truly is, and verify with `SELECT proname, provolatile FROM pg_proc`.

**Trap 3: Assuming `ILIKE` or trigram search will use a `LOWER()` B-tree index.**

What people do wrong: they create `CREATE INDEX ON users (LOWER(email))` and then query `WHERE email ILIKE '%test%'` expecting the lower index to speed up the wildcard search.

Why it is wrong: `ILIKE '%test%'` with a leading wildcard cannot use a B-tree at all, regardless of lowercasing, because B-trees are sorted for prefix matching. And `ILIKE` is a different operator than `=`.

What actually happens: sequential scan every time, even with the expression index present. At scale with millions of rows, this becomes a slow query that shows up in every slow-query log.

The fix: for case-insensitive substring or pattern search, use a trigram GIN index — `CREATE EXTENSION pg_trgm; CREATE INDEX ON users USING gin (email gin_trgm_ops)` — or `LOWER(email) gin_trgm_ops` if you need lowercased trigrams. Reserve B-tree expression indexes for equality and range queries on the computed value.

**Trap 4: Forgetting that expression indexes cost on writes and over-indexing.**

What people do wrong: they create expression indexes for every computed column they might ever query — `LOWER(email)`, `LOWER(name)`, `(price * quantity)`, `date_trunc('day', created_at)`, `COALESCE(nickname, email)` — without checking which queries actually run in production.

Why it is wrong: each index adds write overhead and disk space. On a table with heavy `INSERT` throughput, five expression indexes can noticeably slow down ingestion and increase WAL volume that affects replication lag.

What actually happens: write latency creeps up, autovacuum has more work, and `pg_stat_user_indexes` shows several of those indexes with `idx_scan = 0` — they are never used.

The fix: create expression indexes driven by actual slow queries, not hypothetical ones. Run `EXPLAIN ANALYZE` on the real query, check `pg_stat_statements` for frequent patterns, and drop unused indexes. Combine a partial clause to shrink the index when only a subset of rows are queried.

**Trap 5: Mismatch due to collation or type casts.**

What people do wrong: the index is `LOWER(email)` where `email` is `text`, but the query is `LOWER(email::varchar)` or the column has a non-default collation and the index was created without specifying it.

Why it is wrong: PostgreSQL considers the types and collation part of the expression. A subtle cast or collation difference makes the expressions non-identical.

What actually happens: the planner does not match the index, and the query falls back to a scan. This is especially confusing because `SELECT LOWER(email) FROM users` looks the same in both cases.

The fix: keep the expression text identical between index and query. If your column is `varchar`, cast consistently or just use `text`. If you use a custom collation, include it in both places. When in doubt, copy the exact expression from `pg_indexes.indexdef` into your query.

## 7. Compare With Related Concepts

**Expression index vs regular B-tree index:** A regular index stores the raw column value sorted as-is. An expression index stores the result of a computation on the column. If your query uses the raw column, the regular index helps. If your query wraps the column in a function, only the expression index helps. Rule: index the shape you query — raw column for raw queries, expression for function-wrapped queries.

**Expression index vs partial index:** An expression index changes what is stored (a computed value). A partial index changes which rows are stored (only rows matching a `WHERE` clause). They solve different problems and are often combined. `ON users (LOWER(email)) WHERE deleted_at IS NULL` is both — it stores a computed value but only for active rows. Rule: use an expression when the query computes, use a partial when the query filters to a subset, use both when it does both.

**Expression index vs covering index (INCLUDE):** An expression index makes a computed predicate fast. A covering index with `INCLUDE` makes a query avoid touching the table by storing extra columns in the index leaf pages for index-only scans. They are orthogonal. You can have `CREATE INDEX ON users (LOWER(email)) INCLUDE (id, name)` to make `SELECT id, name FROM users WHERE LOWER(email) = 'x'` an index-only scan. Rule: expression gets you to the right rows, INCLUDE lets you avoid the heap fetch after.

**Expression index vs generated column + regular index:** PostgreSQL lets you create a stored generated column like `lower_email text GENERATED ALWAYS AS (LOWER(email)) STORED` and then index that column normally. The effect is similar, but the generated column is visible as a real column you can select, while an expression index is invisible storage. Generated columns cost more write overhead because the value is stored in the table row itself. Rule: prefer an expression index when you only need the computed value for searching; use a generated column when you also need to select or expose that computed value frequently.

**B-tree expression index vs GIN trigram index:** A B-tree expression index on `LOWER(email)` is excellent for exact equality and prefix searches like `LOWER(email) = 'x'` or `LOWER(email) LIKE 'test%'`. It cannot help with `LIKE '%test%'` where the wildcard is at the front. A GIN trigram index breaks the string into three-letter chunks and can answer substring searches in any position, case-insensitively. Rule: B-tree expression for exact and prefix matches, trigram GIN for arbitrary substring or fuzzy search.

## 8. 🧠 The Memory Hook

An expression index is a second catalog filed by the answer, not the question — it precomputes `LOWER(email)` once at write time so your query does not have to recompute it on every row at read time, but it only works when your query asks for that exact precomputed answer and only with functions that always give the same answer for the same input.
