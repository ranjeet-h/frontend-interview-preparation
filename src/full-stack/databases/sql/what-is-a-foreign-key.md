# What is a Foreign Key

## 1. The Real-World Problem — When You Actually Hit This

An ecommerce app has been running fine for months. Then someone ships a "cleanup inactive accounts" job: `DELETE FROM users WHERE last_login < date('now', '-1 year')`. It runs cleanly, no errors, everyone goes home.

Three days later the tickets start. Customers open their order history and half the rows render blank, because the API joins `orders` to `users` and the join quietly drops every order whose user no longer exists. Finance notices monthly revenue shifted downward — same reason. One support agent finds an order that belongs to a user who, as far as the database is concerned, never existed. Nothing crashed. The data just stopped agreeing with itself.

Every bug in that story is the same bug: a child row (`orders`) was left pointing at a parent (`users`) that got deleted. A foreign key exists precisely so the database refuses to let that happen — either by blocking the insert of a row whose parent doesn't exist, or by blocking the deletion of a parent that still has children, or by doing something deliberate about the children when the parent goes away.

## 2. The Analogy — Make the Mechanic Obvious

Think of an airline. Every boarding pass names a flight, and that flight lives on the airline's master manifest. The gate agent is the database.

You walk up and ask for a boarding pass for flight FL-999. The agent checks the manifest — FL-999 doesn't exist. She refuses. That's the database rejecting the insert of a child row whose parent is missing. No boarding pass without a real flight behind it.

Now suppose flight FL-201 gets cancelled while forty people hold bookings. Airlines have policies, and they're exactly the foreign key's options:

- **Cancel everyone automatically** — the bookings die with the flight. That's `ON DELETE CASCADE`.
- **Refuse to cancel** — "I can't cancel this flight while passengers are still booked on it. Rebook them first." That's `ON DELETE RESTRICT`.
- **Keep the bookings, blank out the flight field** — the booking survives, but it no longer points anywhere. That's `ON DELETE SET NULL`.

One more piece: the agent can verify your pass in seconds because the manifest is sorted — she looks up one page, not every passenger in the airport. That sorted manifest is an index. Without it, every cancellation means paging through the entire passenger list hunting for stragglers, which is literally what a database does to an unindexed child table when you delete a parent.

And the partner-airline case? When two airlines' systems can't see each other's manifests in real time, they can't enforce anything live. Instead they run nightly reconciliation reports looking for bookings that point at flights that don't exist. That's exactly what teams do when they remove foreign keys at scale: they replace a live guarantee with periodic cleanup jobs.

Every part of the analogy maps. Manifest = parent table with a primary key. Boarding pass = child row. Agent = constraint check. Sorted manifest = index. Cancellation policy = the `ON DELETE` action. Reconciliation report = life without foreign keys.

## 3. The Full Explanation — How It Actually Works

In plain words first: a foreign key is a rule attached to a column saying "whatever value ends up in this column must already exist in that specific column over there." The column holding the rule is the foreign key. The column it points at must be a primary key or a unique key — it has to be something the database can look up in one place, which is why SQLite literally refuses to create a foreign key pointing at a non-unique column with the error `foreign key mismatch`.

Once the rule exists, the database enforces it on both directions:

**Inserts into the child table.** Before storing the row, the database checks the parent table for a matching key. Found? Row goes in. Not found? The whole insert fails immediately — `FOREIGN KEY constraint failed` in SQLite, error 1452 in MySQL, error `23503 foreign_key_violation` in PostgreSQL. There is no moment where an orphan exists inside a committed transaction. This check costs one indexed lookup, which is cheap — as long as both sides are indexed.

**Deletes and updates on the parent table.** This is where the policy question appears: children now reference this parent, so what should happen? If you declared nothing, the answer is "block it" (the default, called `NO ACTION`). The four actions you can declare:

**RESTRICT / NO ACTION** — the parent cannot be deleted while children exist. Delete the user, keep their orders, and the delete throws until you handle the orders yourself. The subtle difference between the two names: `NO ACTION` can be deferred to the end of the transaction in databases that support deferred constraints, while `RESTRICT` is checked immediately no matter what. MySQL treats them as identical.

**CASCADE** — deleting the parent automatically deletes the referencing children. Deleting the user deletes their orders, their sessions, their addresses — everything chained. It's powerful and dangerous in equal measure: a single `DELETE` statement can fan out into millions of row deletions, all inside one transaction, all holding locks, all writing to the replication log at once.

**SET NULL** — the parent is deleted, and the child survives with the foreign key column set to NULL. The comment stays, its `author_id` becomes empty. This requires the column to be nullable — if you declared it `NOT NULL`, the delete of the parent fails instead.

**SET DEFAULT** — the child's foreign key column is reset to a declared default value. Rarely used, and there's a catch people miss: that default value must itself exist as a parent row, otherwise the delete fails. You've just moved the integrity requirement, not removed it.

Everything above has an `ON UPDATE` twin. When the *referenced* value changes, the same menu applies. With surrogate integer IDs this almost never matters because nobody updates primary keys. It matters with natural keys — say a `tags.slug` column that gets renamed: `ON UPDATE CASCADE` rewrites every child reference for you.

**Indexes — the part interviews love.** Two sides, two different stories. The *parent* side must be unique-indexed; that's non-negotiable and often automatic, because primary keys and unique keys are indexes. The *child* side is the trap: MySQL's InnoDB silently creates an index on a foreign key column if you didn't, but PostgreSQL creates nothing. Run a parent-delete workload on Postgres with an unindexed child foreign key and every delete does a sequential scan of the entire child table just to prove no orphan would be created. Deletes get mysteriously slower every month as the table grows. The fix is one line — `CREATE INDEX idx_orders_user_id ON orders(user_id)` — and knowing this unprompted is a strong senior signal.

**NULL is special.** A NULL in a foreign key column means "no parent at all," and the database doesn't check it. A comment with a NULL `author_id` isn't broken data; it's anonymous by design. That semantic choice is yours to model deliberately.

**Transactions and timing.** By default each statement's changes are checked as they happen. PostgreSQL lets you declare a constraint `DEFERRABLE INITIALLY DEFERRED`, moving the check to `COMMIT`. That unlocks patterns that are otherwise impossible — like swapping two rows that reference each other, or inserting two mutually-referencing rows in a circular relationship. For ninety percent of schemas you'll never need it, but naming it in an interview separates people who've read about foreign keys from people who've been bitten by one.

**Why some big teams skip foreign keys entirely.** This comes up in every senior loop, so get the real reasons, not "they don't care about correctness":

Sharding kills them first. If `orders` lives on shard 3 and `users` lives on shard 7, no single database node sees both tables, so no node can enforce the rule. Write throughput is the second reason: InnoDB takes a shared lock on the parent row whenever a child row referencing it is inserted, so ten thousand events per second all referencing tenant #42 serialize on tenant #42's row — foreign keys become a contention bottleneck, not just a check. Third is operations: bulk imports have to load parents before children or fail, online schema-change tools historically struggle with foreign keys, and cascading deletes on hot rows produce lock chains that end in deadlocks (see [how do you prevent deadlocks](how-do-you-prevent-deadlocks.md)).

But be honest about what removing them costs, because that's the follow-up: you lose the only guarantee that applies to *every* writer — the application, the migration script, the intern in a SQL console, the third-party importer. Application-level checks protect one code path. The moment two systems write to the same tables, orphans become a matter of time. Teams that drop foreign keys know this, so they rebuild the guarantee with compensating controls: validation in the application, soft deletes instead of hard ones, a dedicated deletion orchestration flow, and — the reconciliation report from our airline analogy — scheduled orphan-detection queries that sweep the data and alert when a child points at a ghost.

**Errors and observability.** In an API context, a foreign key violation shouldn't surface as a raw 500 with a driver error string. Catch the constraint error and map it to a meaningful response — a 409 or 422 like "that user no longer exists" — and log the violation as a signal, because a rising rate of foreign-key failures usually means a race in application logic or a missing parent-creation step.

## 4. See It In Practice — Real Code or Queries

All queries below run as-is on `sqlite3 :memory:`. Note that SQLite only enforces foreign keys when you opt in per connection with `PRAGMA foreign_keys = ON` — that quirk gets its own trap section below. Dialect differences are called out in comments.

The basic setup — parent, child, cascade:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id    INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_cents INTEGER NOT NULL
);

INSERT INTO users (id, email) VALUES (1, 'ana@example.com');
INSERT INTO orders (id, user_id, total_cents) VALUES (100, 1, 4999);
```

Insert an orphan and watch the database refuse:

```sql
INSERT INTO orders (id, user_id, total_cents) VALUES (101, 42, 2500);
-- Error: FOREIGN KEY constraint failed
-- (MySQL reports this as error 1452; PostgreSQL as 23503)
```

Delete the parent, and the children go with it — the cancellation-with-auto-cancel policy:

```sql
DELETE FROM users WHERE id = 1;
SELECT COUNT(*) AS surviving_orders FROM orders;   -- 0, CASCADE removed them
```

Now the other two policies. RESTRICT blocks the delete outright:

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE customers (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE invoices (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL
);

INSERT INTO customers (id, name) VALUES (7, 'Priya');
INSERT INTO invoices (id, customer_id, amount_cents) VALUES (500, 7, 12000);

DELETE FROM customers WHERE id = 7;
-- Error: FOREIGN KEY constraint failed — Priya still has invoices.
```

SET NULL keeps the child alive but severs the link. The column must be nullable:

```sql
CREATE TABLE comments (
  id        INTEGER PRIMARY KEY,
  author_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,  -- no NOT NULL, on purpose
  body      TEXT NOT NULL
);

INSERT INTO comments (id, author_id, body) VALUES (900, 7, 'first!');
-- after the customer is deleted:
SELECT * FROM comments;   -- 900 | NULL | first!
```

ON UPDATE CASCADE — the natural-key rename case:

```sql
CREATE TABLE tags (
  slug  TEXT PRIMARY KEY,
  label TEXT NOT NULL
);

CREATE TABLE article_tags (
  article_id INTEGER NOT NULL,
  tag_slug   TEXT NOT NULL,
  PRIMARY KEY (article_id, tag_slug),
  FOREIGN KEY (tag_slug) REFERENCES tags(slug)
    ON UPDATE CASCADE
    ON DELETE CASCADE
);

INSERT INTO tags (slug, label) VALUES ('sql', 'SQL');
INSERT INTO article_tags (article_id, tag_slug) VALUES (10, 'sql');

UPDATE tags SET slug = 'sql-basics' WHERE slug = 'sql';

SELECT article_id, tag_slug FROM article_tags;
-- 10 | sql-basics   — the rename propagated through every reference
```

A self-referencing foreign key — employees pointing at employees:

```sql
CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  manager_id INTEGER REFERENCES employees(id)   -- NULL = reports to no one (CEO)
);

INSERT INTO employees (id, name, manager_id) VALUES (1, 'Dana', NULL);
INSERT INTO employees (id, name, manager_id) VALUES (2, 'Luis', 1);   -- fine, Dana exists
INSERT INTO employees (id, name, manager_id) VALUES (3, 'Sam', 999);  -- fails: no employee 999
```

And the query that replaces foreign keys when you live without them — the orphan sweep. This is the reconciliation report from the analogy:

```sql
-- Find orders pointing at users who don't exist (FK-less schema):
SELECT o.id, o.user_id
FROM orders o
LEFT JOIN users u ON u.id = o.user_id
WHERE u.id IS NULL;
```

One operational note to pair with these: on PostgreSQL, add an index on the child column yourself — `CREATE INDEX idx_orders_user_id ON orders(user_id)` — because Postgres will not do it for you. On MySQL/InnoDB it's created automatically if missing.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a foreign key, and what problem does it actually solve?**

It's a rule on a column requiring every value in it to match an existing value in a referenced column of another table — usually that table's primary key. The problem it solves is referential integrity: keeping relationships true under every possible writer. Without it, correctness depends on every code path remembering to validate, and any bug, script, or manual query can leave child rows pointing at parents that don't exist — orders belonging to deleted users, sessions belonging to deleted accounts. The foreign key moves that guarantee from "hopefully the application remembers" to "the database physically won't store it."

**Q: What happens when you insert a child row whose parent doesn't exist?**

The insert fails immediately with a constraint error — `FOREIGN KEY constraint failed` on SQLite, error 1452 on MySQL, `23503 foreign_key_violation` on PostgreSQL — and nothing is written. The check is a single indexed lookup into the parent table, so it's cheap. Worth adding: the same applies to updates — you can't repoint a child at a nonexistent parent. And a well-built API translates that constraint error into a client-meaningful response like a 409, instead of leaking a raw driver error as a 500.

**Q: Walk me through the ON DELETE options. When would you pick each?**

The default blocks: a parent with children simply cannot be deleted. Pick `RESTRICT` (or the default `NO ACTION`) when children are business records that must never vanish silently — invoices, payments, audit entries; the caller is forced to decide explicitly what happens to them. Pick `CASCADE` when the children genuinely have no meaning without the parent — sessions, verification tokens, cart items — so deleting the user *should* take them along, and doing it in one statement is simpler and atomic. Pick `SET NULL` when the child outlives the relationship — comments surviving their author — and you'd rather show "former member" than delete history. Each choice is a product decision wearing database syntax, and saying that in an interview lands better than reciting definitions.

**Q: Do foreign key columns need indexes? Which side?**

Both sides matter, differently. The referenced side must be unique-indexed — that's required, because the database needs a fast, unambiguous way to look up parent keys, and most of the time the primary key already provides it. The referencing side is the interview's real question: MySQL/InnoDB auto-creates an index there if you didn't, but PostgreSQL does not. An unindexed child foreign key on Postgres turns every parent delete or key update into a full scan of the child table. So on Postgres you add the index manually — which also speeds up the joins that traverse that relationship anyway.

**Q: Can a foreign key reference something other than the primary key?**

Yes — any column set covered by a UNIQUE constraint works. Referencing a non-unique column is illegal precisely because the lookup must resolve to at most one parent row; SQLite rejects it at parse time with `foreign key mismatch`. The common real cases: referencing a unique `slug` or `email` instead of a synthetic id, and composite foreign keys matching a composite unique key column-for-column — for example `article_tags(tag_slug)` referencing `tags(slug)`, or a junction table whose two columns jointly reference a two-column unique key.

**Q: Can a foreign key column contain NULL?**

Yes, if the column is nullable — and a NULL passes the constraint without being checked, meaning "no parent at all," not "broken reference." That's why `ON DELETE SET NULL` needs a nullable column, and why modeling matters: `comments.author_id` being NULL legitimately means an anonymous comment, whereas `invoices.customer_id` being NULL would mean money owed by nobody, so you'd declare that one `NOT NULL` and let the constraint make missing parents impossible.

**Q: Large-scale teams sometimes disable foreign keys. Why, and what replaces them?**

Real reasons, in order of how often they're decisive: sharding — parent and child land on different nodes, so no single database can enforce the rule; write concurrency — InnoDB locks the parent row when inserting children that reference it, so high-volume inserts onto the same parent serialize and become a bottleneck; and operations — ordered bulk loads, painful online migrations, and cascades that turn one delete into millions of locked row removals. What replaces them is a stack of compensating controls: validation in the application layer, soft deletes and an explicit deletion workflow instead of bare `DELETE`s, and scheduled reconciliation queries that hunt for orphaned rows and alert. The honest trade-off: they traded a database-enforced guarantee that binds every writer for speed and flexibility, and now correctness is a process instead of a property.

**Q: What's the difference between RESTRICT and NO ACTION?**

They feel identical day-to-day — both block a parent delete while children exist. The difference is timing under deferred constraints: `NO ACTION` can wait until the end of the transaction to check, so a transaction may temporarily break the relationship and repair it before commit; `RESTRICT` checks immediately, period. PostgreSQL supports both meanings properly; MySQL implements them as the same thing. Follow-up value: deferred checks are what make circular references and row-swaps writable — declare the constraint `DEFERRABLE INITIALLY DEFERRED` and reorder freely within the transaction.

**Q: Given a legacy database with no foreign keys, how would you find orphaned rows?**

Anti-joins, one relationship at a time: `SELECT o.id FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE u.id IS NULL`. That lists every child whose parent is missing. In practice you generate this for every foreign-key-shaped relationship, wrap it in a scheduled job, and treat results as alerts, not auto-deletes — deciding each orphan's fate (restore the parent, delete the child, reassign) is a business call. If you later want to add the actual constraints, clean the orphans first, because adding a foreign key validates existing data and will fail on a dirty table.

**Q: How do foreign keys interact with transactions?**

Checks happen per-statement by default, inside your transaction, so a failed insert rolls back that statement's work (and depending on the engine and driver, may need explicit savepoint handling). Cascaded deletes execute within the same transaction as the triggering delete — they succeed together or roll back together, which is exactly why cascade cleanup is atomic and safe from partial states. Deferred constraints move the check to commit time, enabling temporarily-invalid intermediate states that end valid. And the lock dimension: cascades and the parent-row locks taken during child inserts all live inside the transaction too, so long-running transactions holding foreign-key locks are a classic deadlock recipe — another reason batch jobs and FK-heavy schemas need care together.

## 6. The Traps — What Goes Wrong in Production

**"The database enforces my foreign keys."** Wrong assumption: declaring a foreign key means it's active everywhere. Reality is engine-specific: SQLite leaves enforcement off by default on every connection until someone runs `PRAGMA foreign_keys = ON`, and MySQL happily accepts foreign key syntax on MyISAM tables and silently ignores it forever. What happens: your DDL says the constraint exists, tests pass because the test setup enabled the pragma or used InnoDB, production accumulates orphans for months. Fix: enable the pragma in every connection factory and ORM config, confirm the storage engine during migrations, and periodically run an anti-join sweep even when you think you're protected.

**"CASCADE makes cleanup easy — just delete the user."** The assumption is that one `DELETE` is free. A cascade against a parent with millions of children executes every child deletion inside that single transaction: long-held locks, a massive burst of WAL/binlog, replica lag spiking, and possibly a timeout that rolls back twenty minutes of work. What actually happens is a routine offboarding script taking down replication at 2am. Fix: for large families, delete in batches (loop over child IDs with a limit), archive before deleting, or use soft deletes so the mass deletion never happens as one statement.

**"Postgres indexes my foreign key column like MySQL does."** It doesn't. People carry the InnoDB assumption over and never index `orders.user_id`. What happens: nothing visible in dev with small tables, then parent deletions and key updates degrade linearly as the child table grows — each one scanning the whole table to verify no orphan results. Fix: index every child foreign key column explicitly on PostgreSQL, and audit for missing ones with a query against the catalog comparing foreign key columns to index leading columns.

**"SET NULL just works."** Declare `author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL` and everything seems fine — until the first user deletion, which fails with a constraint violation that appears to come from nowhere. Why: SET NULL tries to write NULL into a column you forbade NULLs in, so the delete aborts. The error surfaces far from its cause — the admin UI trying to delete a user, failing because of a comment table's declaration. Fix: make the column nullable if "no author" is acceptable, or choose RESTRICT/CASCADE to match what the product actually wants.

**"Adding the foreign key will clean things up."** Adding a constraint validates existing rows. On a table that already contains orphans, the `ALTER TABLE ... ADD CONSTRAINT` fails outright — the constraint doesn't retro-fix data. Worse on busy systems: the validation scan on a huge table holds locks for a long time. Fix: find orphans first with the anti-join, resolve them, and on PostgreSQL add the constraint in two steps — `ADD CONSTRAINT ... NOT VALID` (instant, enforces new writes only) followed by `VALIDATE CONSTRAINT` (scans without blocking reads and writes).

**Circular references that block inserts.** Two tables reference each other — `users.default_address_id` → `addresses.id` and `addresses.user_id` → `users.id`. Now neither row can go first, because each insert references a parent that doesn't exist yet. What happens: developers hack around it by inserting NULLs and patching afterward, in multiple non-atomic statements. Fix: on PostgreSQL, declare the constraints `DEFERRABLE INITIALLY DEFERRED` and insert both rows in one transaction with the checks at commit; or restructure so only one direction is a hard foreign key and the other is validated in application logic.

## 7. Compare With Related Concepts

**Foreign key vs primary key.** A [primary key](what-is-a-primary-key.md) is the identity of a row within its own table — one per table, implicitly unique and non-null. A foreign key doesn't identify anything; it *points* at another table's identity. They're two halves of one relationship: the parent's primary key is what the child's foreign key references. Rule of thumb: primary key answers "who is this row?", foreign key answers "which row over there does this refer to?"

**Foreign key vs unique key.** Both are uniqueness mechanisms, but a [unique key](what-is-a-unique-key.md) only promises "no two rows in this table share this value" — it builds no bridge to another table. A foreign key promises "this value exists over there." Unique keys allow multiple NULLs in most engines (NULLs aren't equal to anything), and unlike primary keys a table can carry many of them. Rule of thumb: unique key for "no duplicates here," foreign key for "must exist there" — and remember a foreign key can target a unique key, not just a primary key.

**Database constraint vs application-level validation.** Checking `user_id` exists in your API handler catches bad input from that handler, but there's a race window between the check and the insert, and it protects none of the other writers — scripts, other services, manual fixes. The database constraint protects every writer, atomically. Rule of thumb: validate in the application for friendly, early error messages; enforce with a foreign key so correctness never depends on which code path ran.

## 8. 🧠 The Memory Hook

A foreign key makes the database the guardian of one promise: no child row ever points at a ghost. And since parents don't leave on their own, you hand the database the death policy in advance — CASCADE takes the kids along, RESTRICT refuses the funeral, SET NULL leaves the kids alive but nameless.
