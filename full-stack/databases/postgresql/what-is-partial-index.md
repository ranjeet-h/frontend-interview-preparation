# What Is Partial Index

## 1. The Real-World Problem — When You Actually Hit This

Your `orders` table has been fine for a year. Now it has 5 million rows. 95% of them are `completed` or `cancelled` — old history nobody queries. But your dashboard runs `SELECT * FROM orders WHERE status = 'pending'` every few seconds and suddenly it takes 4 seconds. You add a normal index on `status`, it helps a little, but that index is huge because it indexes every single row including the millions of completed ones you never search for. Every insert and update pays to maintain that giant index, it eats RAM, and it barely fits in cache anymore.

Same pain shows up with soft deletes. You add `deleted_at` to `users` so you never hard-delete. You want `email` to be unique, but only for active users — if someone deletes their account, a new user should be able to reuse that email. A normal `UNIQUE` on `email` blocks that forever. And if you try to fake it in application code, two concurrent requests slip past the check and you get duplicate active emails.

This is the moment a partial index clicks. You do not need an index on everything. You need a small, sharp index on just the slice you actually query and care about.

## 2. The Analogy — Make the Mechanic Obvious

Think of a warehouse with 2 million boxes.

A full index is like keeping a sorted catalog of every box in the building, even the ones in deep archive you never touch. The catalog is thick, heavy, slow to flip through, and every time you move any box you have to update the catalog.

A partial index is a small catalog that only lists boxes tagged `needs_shipping`. If only 50,000 boxes have that tag, your catalog is 40 times smaller. Finding a box is faster, carrying the catalog is cheaper, and moving an archived box does not require updating it at all.

The mapping is exact:

- The `WHERE deleted_at IS NULL` or `WHERE status = 'pending'` you put on the index is the tag rule — it decides which boxes get into the small catalog. Postgres never adds other rows to that index.
- The index entries themselves are the cards in that small catalog — only for rows that passed the filter.
- Your query is the person walking in and asking for a box. If you ask for "box 42 where needs_shipping is true," the warehouse worker can hand you the small catalog instantly. If you just ask for "box 42" without mentioning the tag, they cannot use the small catalog — they have no idea if box 42 is even in there, so they go search the whole building instead.

That last part is the key: the index only helps when your query repeats the same filter the index was built with.

## 3. The Full Explanation — How It Actually Works

In plain words, a partial index is a normal B-tree index (or any index type) that only includes rows that match a `WHERE` predicate you choose at creation time.

```sql
CREATE INDEX idx_orders_pending ON orders (created_at) WHERE status = 'pending';
```

Postgres literally skips every row where `status != 'pending'` when building and maintaining the index. The index stores no entry for those rows. What you get is:

Why this is powerful. Size is proportional to the matching subset, not the whole table. If only 5% of rows are pending, the index is roughly 5% of the size a full index would be. Smaller means fewer disk pages, shallower B-tree, more of it fits in `shared_buffers`, faster scans, and much cheaper `VACUUM` and cache behavior.

Write cost drops too. An `INSERT` or `UPDATE` that touches a row not matching the predicate does not touch the index at all. Updating a `completed` order does not pay the price for the pending-orders index. In a write-heavy table where hot queries target a small slice, this is a big win.

Conditional uniqueness falls out for free. A normal `UNIQUE` index enforces uniqueness everywhere. A partial unique index enforces it only inside the slice:

```sql
CREATE UNIQUE INDEX uniq_users_email_active ON users (email) WHERE deleted_at IS NULL;
```

Now two active users cannot share an email, but you can have ten deleted rows with the same email and Postgres allows it. You get a real database guarantee without application race conditions.

Internally, the planner treats a partial index as usable only when the `WHERE` clause of your query implies the index predicate. Postgres does not do magic guessing. If the index is `WHERE deleted_at IS NULL` and your query does not mention `deleted_at` at all, the planner assumes the index might be missing rows you need and will not use it. You must write the same condition in the query.

Tradeoffs to carry with you. A partial index helps zero queries that do not include its predicate. If your access pattern changes and you start querying `status = 'completed'` heavily, this index is useless for that. Predicates must use immutable expressions — you cannot put `random()` or `now()` in the index condition. A partial unique index does not stop duplicates outside the slice, which is intentional but surprises people who think "unique means unique everywhere." And like any index, it still costs something for matching rows — do not create ten overlapping partial indexes thinking they are free.

When to use it: the column is queried heavily but only for a specific value or `IS NULL / IS NOT NULL` slice, the slice is small relative to the table, or you need unique enforcement only for active/current rows. Common production cases are `WHERE deleted_at IS NULL`, `WHERE status IN ('pending','processing')`, `WHERE is_active = true`, and sparse columns where most rows are `NULL` and you only index the non-null ones.

When not to use it: the filter is not selective (say 60% of rows match — just use a full index), or every query filters by a different value and no single slice dominates.

It interacts cleanly with the rest of Postgres. It works with `CREATE INDEX CONCURRENTLY` so you can add it without locking writes on a live table. `EXPLAIN` will show `Index Scan using idx_orders_pending` when it is used. `VACUUM` has less work because there are fewer index entries to clean.

## 4. See It In Practice — Real Code or Queries

All examples are PostgreSQL syntax. Run them in `psql` and check with `EXPLAIN`.

**1. Index only the rows you actually query — pending orders**

```sql
-- Table with soft lifecycle column
CREATE TABLE orders (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  status      text NOT NULL, -- 'pending', 'completed', 'cancelled'
  created_at  timestamptz NOT NULL DEFAULT now(),
  total_cents int NOT NULL
);

-- Big table: millions of completed rows, a few percent pending
-- Full index would be huge. Partial keeps only what the dashboard queries.

CREATE INDEX idx_orders_pending_created
  ON orders (created_at)
  WHERE status = 'pending';

-- This query CAN use the partial index — predicate matches
EXPLAIN SELECT * FROM orders
WHERE status = 'pending'
ORDER BY created_at
LIMIT 50;

-- This query CANNOT use it — missing the same filter
-- Planner will not consider idx_orders_pending_created at all
EXPLAIN SELECT * FROM orders
ORDER BY created_at
LIMIT 50;
```

**2. Conditional uniqueness — the classic soft-delete case**

```sql
CREATE TABLE users (
  id         bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  email      text NOT NULL,
  deleted_at timestamptz
);

-- Only active rows must have unique email
CREATE UNIQUE INDEX uniq_users_email_active
  ON users (email)
  WHERE deleted_at IS NULL;

-- Works: reusing an email from a deleted account is allowed
INSERT INTO users (email, deleted_at) VALUES ('a@example.com', now()); -- deleted, allowed
INSERT INTO users (email) VALUES ('a@example.com'); -- active, allowed (only one active copy)

-- Fails: second active user with same email violates the partial unique index
-- INSERT INTO users (email) VALUES ('a@example.com'); -- ERROR: duplicate key

-- Your app query must include the same predicate to get the index
EXPLAIN SELECT * FROM users WHERE email = 'a@example.com' AND deleted_at IS NULL;
-- Uses uniq_users_email_active

EXPLAIN SELECT * FROM users WHERE email = 'a@example.com';
-- May not use it — planner cannot prove you only want active rows
```

**3. Sparse column — only index rows where a foreign key exists**

```sql
CREATE TABLE tasks (
  id          bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  title       text NOT NULL,
  assignee_id bigint REFERENCES users(id) -- mostly NULL, only 10% assigned
);

-- Index only the assigned tasks, keep it tiny
CREATE INDEX idx_tasks_assignee
  ON tasks (assignee_id)
  WHERE assignee_id IS NOT NULL;

EXPLAIN SELECT * FROM tasks WHERE assignee_id = 42 AND assignee_id IS NOT NULL;
-- Uses the partial index; without the IS NOT NULL the planner might skip it
-- depending on statistics, so be explicit
```

**4. Creating without blocking writes on a live table**

```sql
-- On a production table, always use CONCURRENTLY to avoid exclusive lock
CREATE INDEX CONCURRENTLY idx_orders_pending_status
  ON orders (status) WHERE status = 'pending';
```

Check that the index is used after creation. If `EXPLAIN` shows `Seq Scan` when you expected an index scan, you almost certainly forgot to repeat the `WHERE` condition in the query itself.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a partial index in PostgreSQL?**

It is an index that only stores entries for rows that satisfy a `WHERE` condition you give at creation time. You write `CREATE INDEX ... ON table (cols) WHERE <predicate>` and Postgres builds a normal B-tree (or hash, GIN, etc.) but simply never inserts rows that fail the predicate. The result is a much smaller index that is cheaper to maintain and faster to scan for queries that target that same slice. It is not a different index type — it is a filtered version of any index type.

**Q: How is a partial index different from a normal (full) index?**

A full index has one entry per row in the table. A partial index has one entry per row that matches its predicate — maybe 2-5% of the table. That makes it smaller, faster, and less RAM-hungry, and writes to non-matching rows do not touch it at all. The cost is it only helps queries whose `WHERE` clause implies the same predicate. A full index helps any query filtering on its columns, regardless of other conditions.

**Q: When will Postgres actually use my partial index?**

Only when the planner can prove your query needs a subset of the indexed rows. In practice that means your query's `WHERE` must include the same condition (or a stricter one that implies it). If the index is `WHERE status = 'pending'` you must query with `WHERE status = 'pending' ...`. If the index is `WHERE deleted_at IS NULL`, query with `WHERE deleted_at IS NULL AND email = $1`. If you leave the predicate out, the planner correctly refuses to use the index because it knows the index is incomplete and might be missing rows you asked for.

**Q: How do you enforce that an email is unique only for active users?**

With a partial unique index: `CREATE UNIQUE INDEX uniq_users_email_active ON users (email) WHERE deleted_at IS NULL;`. Postgres then enforces uniqueness only among rows where `deleted_at IS NULL`. Deleted rows are outside the index and can duplicate freely. This is concurrency-safe, unlike an application-level check where two requests can race between read and write and both insert. It is the standard solution for soft-delete uniqueness.

**Q: What are the concrete benefits over a full index?**

Three things interviewers want to hear. Size: proportional to matching rows, so more of it fits in memory and scans read fewer pages. Speed: shallower B-tree and smaller working set means faster lookups for that slice. Write overhead: inserts/updates to non-matching rows skip the index entirely, so you pay maintenance cost only when you touch relevant rows. On a table where hot queries hit a 5% slice, these add up to visibly lower latency and less bloat.

**Q: What are the limitations or downsides?**

It helps zero queries that do not include its predicate, so it is not a general replacement for a full index. The predicate must be immutable — no `now()` or volatile functions. It does not speed up queries on the unindexed slice (completed orders, deleted users). If the slice grows to cover most of the table, the size advantage disappears and a full index with maybe a different column order would have been simpler. And like any index, mischoosing the predicate or creating many overlapping partial indexes still adds write cost and planner confusion.

**Q: Can you have multiple partial indexes on the same table?**

Yes, and that is often the right design. For example, `WHERE status = 'pending'` and `WHERE assignee_id IS NOT NULL` serve completely different query shapes. Keep each one narrow and give it a name that spells out the predicate, like `idx_orders_pending` or `uniq_users_email_active`. The rule is one sharp index per hot access path, not one giant index hoping to cover everything.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: You create the partial index but your query forgets the predicate.**

This is the number one mistake. You build `CREATE INDEX idx ON orders (created_at) WHERE status = 'pending'` then query `SELECT * FROM orders WHERE created_at > now() - interval '7 days'`. The index exists but `EXPLAIN` shows a sequential scan and you blame Postgres. The planner is correct — the index has no entries for `completed` rows, so it cannot answer a query that might need them. Fix is to repeat the condition: `WHERE status = 'pending' AND created_at > ...` in every query that should use it. If you use an ORM, wrap this in a scope so you cannot forget.

**Trap 2: The predicate looks the same but is not exactly the same.**

`WHERE status = 'pending'` is not the same as `WHERE lower(status) = 'pending'` or `WHERE status::text = 'pending'` with a different collation. `WHERE deleted_at IS NULL` is not implied by `WHERE deleted_at = NULL` (which is never true in SQL). Small differences make the planner decide the index might not contain your rows. Match the predicate textually, or at least make sure your query condition logically implies the index predicate.

**Trap 3: Thinking a partial unique index protects all rows.**

After `CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`, you can still insert ten rows with the same email as long as each has `deleted_at` set. That is the feature, but teams sometimes think uniqueness is global and are surprised when deleted duplicates exist. If you need global uniqueness, use a full unique index. If you need per-slice uniqueness, document that deleted duplicates are expected and make your application queries always filter on `deleted_at IS NULL`.

**Trap 4: Putting a volatile function in the predicate.**

`CREATE INDEX ... WHERE created_at > now() - interval '30 days'` will fail because `now()` changes every call — Postgres cannot maintain such an index. Predicates must be immutable with respect to the row: `status = 'pending'`, `deleted_at IS NULL`, `assignee_id IS NOT NULL` are all fine because they depend only on row values. If you need a rolling window, use a normal index and filter in the query, or partition the table.

**Trap 5: Making the slice too big or creating too many slices.**

A partial index on `WHERE is_active IN (true, false)` or where 70% of rows match is pointless — just build a full index. On the other flip side, creating eight different partial indexes for every possible status value clutters the planner and adds write overhead for each insert. Pick the one or two hot values that actually dominate your slow queries, verify with `pg_stat_user_indexes` and `EXPLAIN (ANALYZE, BUFFERS)`, and remove the rest.

## 7. Compare With Related Concepts

**Partial index vs Full index:** A full index covers every row; a partial index covers only rows matching its `WHERE` clause. The full index helps any query on those columns but is larger and costlier to maintain. Rule: use a partial index when a small, hot slice dominates your queries (like `status = 'pending'` on a huge history table); use a full index when queries need arbitrary values across the whole table.

**Partial index vs Expression (functional) index:** A partial index filters *which rows* are indexed, an expression index transforms *what value* is indexed, like `CREATE INDEX ON users (lower(email))`. They solve different problems — filtering vs transformation — and they stack: `CREATE INDEX ON users (lower(email)) WHERE deleted_at IS NULL` is both partial and expression. Rule: use partial when the win is indexing fewer rows; use expression when the win is querying a transformed value without wrapping the column in a function at query time.

**Partial index vs Covering index (INCLUDE):** A partial index makes the index smaller by storing fewer rows; a covering index makes queries faster by storing extra columns so the heap does not need to be visited (`INCLUDE (name, total)`). They are independent axes. Rule: use partial to narrow the row set, use `INCLUDE` to avoid table lookups for `SELECT` columns you always need — combine them when your hot query is both narrow and needs to be index-only.

**Partial index vs Application-level filtering:** Checking uniqueness or filtering in app code races under concurrency, while a partial index gives a real database guarantee that two simultaneous transactions cannot violate. Rule: if correctness depends on uniqueness for a slice, enforce it with a partial unique index and let the app turn the database error into a 409, rather than trying to lock or check-then-insert in code.

## 8. 🧠 The Memory Hook

A partial index is a tiny catalog for just the boxes you actually search for — but the warehouse only opens it if you say the tag out loud in your query.
