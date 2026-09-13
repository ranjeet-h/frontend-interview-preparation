# What Is a Primary Key

## 1. The Real-World Problem — When You Actually Hit This

A user clicks "Place Order". The request times out on a flaky network. Your frontend retries. Your queue retries too. Now the orders table has two rows for one order and the customer gets charged twice. Nothing in your application code caught it, because the retry landed on two different app servers half a second apart — no amount of "check if the order exists first" logic can survive that race reliably.

Or the quieter version: support tickets saying "this customer somehow has two accounts and their loyalty points are split between them." Same email, two rows, two identities. Every report about that customer is now wrong in a different way.

The root cause is always the same: nothing at the storage layer guaranteed that **one real thing equals exactly one row**. A primary key is the database's promise that each row has exactly one identity — no duplicates, no missing identity, ever, even under concurrent writes from twenty servers. It's the cheapest correctness guarantee you will ever get, and it's enforced below every line of application code you write.

## 2. The Analogy — Make the Mechanic Obvious

Think about how a school issues admission numbers.

A school cannot use student names as identity. Two kids named "Rahul Sharma" join the same year, and names change when people marry or legally rename. So on admission day the office assigns a meaningless number — say 4021 — from a counter, writes it once in the register, and never changes it or reuses it for as long as the school exists. Every mark sheet, fee receipt, and transfer certificate references 4021, never the name.

Now map every part:

- **The number is meaningless but permanent.** That's a *surrogate* primary key. It identifies the row without describing it, which is exactly why it survives name changes.
- **Every admitted student must have a number.** No number, no enrollment record. That's the *NOT NULL* half of a primary key.
- **No two students share a number.** Not because the clerk is careful — because the register itself rejects it. That enforcement lives in the ledger, not in the clerk's diligence. In database terms, the constraint lives in the engine, not in your API handler.
- **The register is kept sorted by admission number.** New admissions always get the next number, so the clerk just writes on the last page — fast. Imagine instead assigning random eight-digit codes: every new entry would land somewhere in the middle of the book and the clerk would have to squeeze pages apart all day. This is precisely what happens inside MySQL's InnoDB when you insert random UUIDs into the primary key, and we'll get to that.
- **Class roll numbers restart at 1 in every class.** "Roll number 7" is ambiguous alone; only the pair *(class, roll number)* is unique. That's a composite key.

Keep this school in your head. Every technical term coming next is just naming something the register already does.

## 3. The Full Explanation — How It Actually Works

In plain words: a primary key is one column (or one combination of columns) that the database guarantees will be **unique across all rows** and **never null**, for as long as the table exists. You declare it once, and the engine enforces it forever — including against concurrent inserts from different connections.

Three properties matter more than the definition:

**One per table, enforced by an index.** A table gets exactly one primary key — but that key may span multiple columns. To enforce uniqueness the engine automatically builds a unique index over the key columns, so lookups by primary key are fast B-tree seeks, not table scans. Duplicate insert attempts fail immediately with an error like `UNIQUE constraint failed` in SQLite or `duplicate key value violates unique constraint` in PostgreSQL (standard SQLSTATE 23505).

**NOT NULL is part of the deal.** The SQL standard says primary key columns imply NOT NULL, and PostgreSQL, MySQL, and SQL Server enforce it. One honest footnote for interviews: SQLite historically allowed NULLs in non-integer primary key columns unless you write `NOT NULL` explicitly (a documented legacy quirk), so explicit `NOT NULL` is good hygiene everywhere. A row with no identity is unreferenceable, so the "never null" rule isn't pedantry — it's what makes foreign keys possible.

**It becomes the anchor other tables point at.** Child tables reference the primary key via foreign keys. Orders reference customers, enrollments reference students. Because the key is unique and immutable-ish, that pointer stays valid. This is why changing a primary key later is such a big deal — more on that shortly.

**Surrogate vs natural keys.** A *natural key* is an attribute that already exists in the real world: email, passport number, ISBN. A *surrogate key* is a meaningless identifier invented purely for the table: auto-incrementing integer, UUID. Our admission number was a surrogate; the birth certificate number would have been a natural key.

Surrogates win as the primary key in most systems because real-world attributes betray you: emails change, national IDs turn out not to be unique in practice, and exposing PII as identifiers creates privacy headaches. But here's the trap in the other direction — choosing a surrogate does **not** remove the need for the natural key. If users log in by email, email still needs its own `UNIQUE` constraint, or you get two accounts for one person anyway. Surrogate key for referencing, unique constraint for truth.

**Auto-increment vs UUID.** This is where interviews go deep, so let's do it properly.

**Auto-increment integers** (`AUTO_INCREMENT` in MySQL, `GENERATED ALWAYS AS IDENTITY` in PostgreSQL, plain `INTEGER PRIMARY KEY` in SQLite) give you short, ordered, cheap ids: 8 bytes for a bigint versus 16 raw bytes (36 characters as text) for a UUID. Generation needs coordination with the database, which means you don't know the id until the row is inserted, and merging data from two independently-numbered databases collides.

**Random UUIDs (version 4)** flip those trade-offs: any server can generate one offline with zero coordination, they're safe to expose publicly, and shards never collide. The cost shows up in write-heavy MySQL workloads, and the reason is physical.

InnoDB stores the table itself as a B-tree sorted by primary key — the *clustered index*. The table and the primary key index are the same structure. With sequential keys, every insert goes to the rightmost page: append, occasionally start a fresh page, done. Cache-friendly, minimal locking contention, ~100% page fill. With random v4 UUIDs, each insert lands at a unpredictable spot across millions of pages: fetch the target page (likely a cache miss), split it if full, leave both halves half-empty. Writes slow down, the tree bloats, and the buffer pool fills with sparse pages instead of hot data. Worse, every secondary index in InnoDB stores the primary key as its row locator — so a fat random primary key quietly makes *every* index on the table bigger and shallower.

**UUIDv7 and ULID** resolve most of this. They put a millisecond timestamp in the leading bits, so values generated now sort after older ones. Inserts become near-appends into the clustered B-tree again, while keeping global uniqueness and client-side generation. Residual randomness causes occasional mid-tree inserts, but orders of magnitude fewer than v4. Practical availability: generate them in application code (most languages have libraries); PostgreSQL 18 added a built-in `uuidv7()`, and MySQL expects you to generate app-side and store as `BINARY(16)`, not `CHAR(36)`.

One nuance worth saying out loud in an interview: PostgreSQL tables are heap-stored, not clustered by primary key, so random UUIDs hurt Postgres far less than InnoDB — mainly through index size and cache locality, not page splits during insert. The "random UUID kills performance" story is specifically strongest for MySQL/InnoDB and similar clustered engines.

Time-ordered ids also leak creation time to anyone who sees them. Usually fine; occasionally a compliance conversation.

**Can a primary key be changed?** Technically yes, practically treat it as never-at-runtime. In InnoDB the primary key *is* the physical layout, so dropping and re-adding it rebuilds the entire table and forces every secondary index to rewrite its embedded pointers. In PostgreSQL it drops and rebuilds a large unique index while taking locks. Every foreign key pointing at the old key must be updated, cached plans invalidate, and replicas replay the whole mess. If you genuinely must migrate (say, int to bigint, or int to UUIDv7), the sane path is: add the new key alongside, backfill in batches, switch references behind a flag, then retire the old one — a planned migration, not an `ALTER TABLE` on a Friday.

**Multi-column primary keys.** A primary key over several columns means the *combination* is unique, not each column individually. The classic home is junction tables: `(student_id, course_id)` as the primary key of an enrollments table makes double-enrollment structurally impossible — the database refuses, regardless of how many services try concurrently. Two other places it shines: tenant-scoped tables where `(tenant_id, id)` matches your sharding boundary, and PostgreSQL partitioned tables, which require the partition key to be part of the primary key anyway. Order matters for performance: the engine sorts by first column first, so lead with the column most queries filter on.

## 4. See It In Practice — Real Code or Queries

All blocks below run as-is on SQLite (`sqlite3 :memory:`); dialect-specific syntax is labeled.

**The basic contract: identity plus uniqueness on the natural attribute.**

```sql
CREATE TABLE customers (
  id    INTEGER PRIMARY KEY,        -- surrogate key; SQLite aliases this to the internal rowid
                                    -- and auto-fills it when omitted (MySQL: AUTO_INCREMENT,
                                    -- Postgres: GENERATED ALWAYS AS IDENTITY)
  email TEXT    NOT NULL UNIQUE,    -- natural key: uniqueness for truth, since login is by email
  name  TEXT    NOT NULL
);

INSERT INTO customers (email, name) VALUES ('asha@example.com', 'Asha');

-- A retry or double-submit hits this:
INSERT INTO customers (id, email, name)
VALUES (1, 'dev@example.com', 'Dev');
-- UNIQUE constraint failed: customers.id

INSERT INTO customers (email, name) VALUES ('asha@example.com', 'Asha V');
-- UNIQUE constraint failed: customers.email
```

Two different guards fired there, and both matter: the primary key protects identity, the unique constraint protects reality. Neither substitutes for the other.

**Composite primary key: making duplicates structurally impossible.**

```sql
CREATE TABLE students (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
CREATE TABLE courses  (id INTEGER PRIMARY KEY, title TEXT NOT NULL);

CREATE TABLE enrollments (
  student_id  INTEGER NOT NULL REFERENCES students(id),
  course_id   INTEGER NOT NULL REFERENCES courses(id),
  enrolled_at TEXT    NOT NULL,
  PRIMARY KEY (student_id, course_id)   -- the pair is unique; either column alone is not
);

INSERT INTO enrollments VALUES (1, 1, '2026-08-26');
INSERT INTO enrollments VALUES (1, 1, '2026-08-27');
-- UNIQUE constraint failed: enrollments.student_id, enrollments.course_id
```

No check-then-insert race, no advisory lock, no application code. The second attempt fails at the engine level even if it comes from a different server milliseconds after the first.

**Why id generation belongs to the database (or a proper generator):**

```sql
-- WRONG pattern seen in app code:
--   next_id = SELECT MAX(id) + 1 FROM customers; INSERT ...;
-- Two concurrent requests read the same MAX(id), both insert, one crashes
-- with a duplicate key error (or worse, silently overwrites if you upsert).
-- Let AUTO_INCREMENT / IDENTITY / rowid allocate, or mint a UUIDv7 client-side.
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a primary key, and what exactly does the database guarantee?**

That each row carries an identifier made of one or more columns that is unique across the table and never null, enforced by the engine via an automatic unique index — not by application code. So the guarantees are: no two rows share the key, no row lacks the key, and lookup by the key is an index seek. One table, one primary key; the key may span multiple columns. The practical consequence is that identity is decided at schema design time and holds under arbitrary concurrency — which is why things like double-submitted orders should be impossible by construction, not prevented by hope.

**Q: Can a table have more than one primary key?**

No — one primary key per table. But two facts hide behind that "no". First, a single primary key can cover multiple columns (a composite key), so `(order_id, product_id)` is one primary key, not two. Second, a table can have many *unique constraints* alongside the primary key, so `customers` can have a primary key on `id` plus a unique constraint on `email`. People who say "multiple primary keys" usually mean "multiple candidate keys", and only one of them gets promoted to primary — the rest become unique constraints.

**Q: Primary key vs unique key — they're both unique, so why have both?**

Because they answer different questions. A unique constraint says "no duplicates in this business attribute" — and standard SQL allows multiple NULLs there, since NULL isn't equal to anything, including another NULL. A primary key says "this is the row's official identity" — implying NOT NULL, limited to one per table, referenced by foreign keys, and in clustered engines like InnoDB it determines physical row placement. Rule of thumb: one primary key for identity, as many unique constraints as you have attributes that must be true-of-one.

**Q: Surrogate or natural keys — how do you choose?**

Default to a surrogate (auto-increment bigint or time-ordered UUID) as the primary key, and keep unique constraints on the natural attributes. Natural keys fail as primary keys because real-world attributes change (emails get updated, forcing cascade updates through every child table), turn out not to be unique in practice (national IDs have collisions), and leak PII into URLs and logs. But going surrogate-only is its own bug — without a unique constraint on the natural key you get duplicate accounts for one human. So: surrogate references the row, unique constraint enforces the truth about the world.

**Q: Why can random UUIDs hurt write performance as primary keys? How do UUIDv7/ULID fix it?**

The pain is specific to clustered-storage engines like MySQL's InnoDB, where the table is physically a B-tree sorted by primary key. Sequential keys mean every insert appends to the rightmost page. Random v4 UUIDs scatter inserts across the whole tree, forcing page reads from disk, page splits that leave pages half-full, a bloated tree, and a cold buffer pool — and since InnoDB secondary indexes embed the primary key as their locator, a 16-byte random key inflates every index on the table. UUIDv7 and ULID embed a timestamp prefix, so generated-now values sort after existing ones: inserts become near-appends while keeping global uniqueness and client-side generation. Caveat that shows depth: PostgreSQL heaps don't cluster by primary key, so v4 costs Postgres index size and cache locality rather than insert-time page splits. And store UUIDs as binary (16 bytes), not as 36-character strings.

**Q: Can you change a primary key later? What does it actually cost?**

You can, and you shouldn't casually. Dropping and re-adding a primary key rebuilds the enforcement index; in InnoDB it rebuilds the entire table, because the table *is* the clustered index. Every secondary index rewrites its embedded key pointers, every foreign key referencing the old key must be updated, plans invalidate, and replicas replay the churn — on a large table that's an outage-shaped operation. If the change is truly needed, run it as a planned online migration: add the new key, backfill in batches, switch readers and writers over behind a feature flag, drop the old key last. In an interview, "treat the primary key as immutable and pick it deliberately" is the senior answer.

**Q: When would you actually use a composite primary key?**

When the pair (or tuple) of columns *is* the identity. Junction tables are the canonical case: `PRIMARY KEY (student_id, course_id)` on an enrollments table makes duplicate enrollment impossible by construction, with zero application logic. Multi-tenant tables often use `(tenant_id, id)` to match the sharding key. PostgreSQL partitioned tables require the partition key inside the primary key, forcing composites there. Remember the semantics: the combination is unique, individual columns aren't — roll number 7 exists in every class. Also mind column order, since the index sorts by the leading column first.

**Q: If `id` is the primary key, do I still need `UNIQUE` on email?**

Yes, absolutely. The primary key only enforces uniqueness of the key columns themselves — it knows nothing about your business rules. Without `UNIQUE(email)`, two concurrent signups with the same address both succeed with different ids, and now one human has two accounts, split carts, split order history. This exact miss is behind a large fraction of "duplicate account" support tickets. Identity (`id`) and truth (`UNIQUE(email)`) are separate declarations, and mature schemas carry both.

## 6. The Traps — What Goes Wrong in Production

**"The primary key prevents duplicates."** The wrong assumption: any duplicate is blocked. Why it's wrong: the key only covers its own columns. What actually happens: your retry-safe-looking service inserts two rows with identical emails and different auto-generated ids — both pass the primary key, both commit, one human owns two accounts. The fix: unique constraints on every attribute that must be true-of-one, with the surrogate id handling identity. The opening story of this page is exactly this trap wearing a network-retry costume.

**"PRIMARY KEY implies NOT NULL, so I never write it."** Mostly true — the SQL standard says so and MySQL/PostgreSQL enforce it. What actually happens: on SQLite, a documented legacy quirk allows NULLs in non-integer primary key columns of ordinary tables unless you declare `NOT NULL` yourself — I verified `CREATE TABLE weird (a TEXT PRIMARY KEY); INSERT INTO weird (a) VALUES (NULL);` succeeds on modern SQLite. Fix: write `NOT NULL` explicitly anyway; it documents intent and behaves identically everywhere.

**Random UUIDv4 as an InnoDB primary key.** Wrong assumption: "globally unique ids are free." What actually happens: six months later, write latency creeps up, the table and its indexes are twice the size you modeled, and the buffer pool hit rate sinks because inserts land on cold pages all over the tree, splitting them. Fix: UUIDv7 or ULID for new tables, `BINARY(16)` storage instead of `CHAR(36)`, or auto-increment bigints where global generation isn't required. For an existing table, this is a planned migration, not a Friday `ALTER`.

**Generating ids with `MAX(id) + 1`.** Wrong assumption: reads and writes are serialized. What actually happens: two requests read the same max under concurrency, both insert, one dies with a duplicate key error — or worse, an `INSERT ... ON DUPLICATE KEY UPDATE` silently merges two unrelated operations. Fix: let the engine allocate (`AUTO_INCREMENT` / `IDENTITY`), or mint UUIDv7 client-side. Sequencing is the database's job.

**Treating sequential ids as secret.** Wrong assumption: unguessable means authorized. What actually happens: `/api/orders/14873` tells a competitor you've processed roughly fifteen thousand orders, and an attacker walks ids to harvest other users' records if authorization is loose (the classic IDOR bug). Fix: ids are identifiers, not credentials — enforce ownership checks on every access, and use opaque tokens (or UUIDv7) in URLs where exposure matters.

**Thinking a composite key makes each column unique.** Wrong assumption: `PRIMARY KEY (student_id, course_id)` stops duplicate students. What actually happens: it doesn't — one student appears many times, paired with different courses; only repeated *pairs* are rejected. Fix: if a column must be individually unique, it needs its own unique constraint; composite keys guard relationships, not members.

**Changing the primary key "just this once" on the live table.** Covered in depth above — the cost is a physical rebuild in clustered engines plus FK churn across the schema. Fix: design the key deliberately up front; migrate as a planned multi-step rollout otherwise.

## 7. Compare With Related Concepts

**Primary key vs unique key.** Both enforce uniqueness via an index. The primary key is the row's official identity: implied NOT NULL, exactly one per table, the default target of foreign keys, and in clustered engines it decides physical placement. Unique keys are extra promises about business attributes — several allowed per table, typically NULL-tolerant. Rule: one primary key for identity, a unique constraint for every fact that must be true-of-one.

**Primary key vs composite key.** These aren't opposites — a composite key is a primary key (or unique constraint) spanning multiple columns, unique as a tuple. Use a single-column surrogate for entity identity; use composite keys when the relationship itself is the identity, as in junction tables and tenant-scoped rows.

**Primary key vs foreign key.** A primary key says "each row here is uniquely identifiable"; a foreign key in another table says "this column must contain a primary key value that actually exists over there." Primary key protects identity within a table; foreign key protects referential integrity between tables. They're two halves of one mechanism — FKs are only trustworthy because PKs guarantee their targets exist and are unique. Rule: PK on the parent, FK on the child, and decide `ON DELETE` behavior consciously (RESTRICT to block, CASCADE to propagate — never as a surprise).

## 8. 🧠 The Memory Hook

The primary key is the school admission register: a meaningless number issued exactly once, mandatory, never reused — while names (your natural attributes) collide and change. Sequential numbers let the clerk append to the last page; random numbers make her squeeze entries into the middle of the book all day. Identity is the key; truth is the unique constraint; trust between tables is the foreign key.
