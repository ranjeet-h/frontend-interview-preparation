# What Is a Table

## 1. The Real-World Problem — When You Actually Hit This

A teammate ships v1 of an orders feature fast. There's no time for database ceremony, so the "orders table" is created with zero constraints — just columns, nothing else. For three weeks it's fine. Then support tickets start coming in: one customer sees a negative total of -4999, another has two accounts with the same email, and someone's order status says `'Paid'` while everyone else's says `'paid'`. A nightly sync script wrote directly to the database with uppercase values, a failed payment retry wrote a negative amount, and a double-click submitted the same signup twice. Every one of those bugs passed through the app's validation layer — because half these writers didn't go through the app at all.

This is the moment you understand what a table really is: not a container for data, but a contract about what data is allowed to exist. The teams who treat tables like spreadsheets get spreadsheet-quality data. The teams who understand tables get a database that actively refuses garbage, no matter who — or what — tries to write it.

## 2. The Analogy — Make the Mechanic Obvious

Think of a hotel front desk, old school, paper registers.

There's a **guest register**: a bound book with pre-printed columns — name, passport number, room number, check-in date. The printed header is the table's **schema**. You can't scribble "favorite pizza" in the margin, because the form defines what information exists. Each guest gets exactly one **line** in the book — that's a **row**. Each box you fill in on that line is a **cell**. And crucially, the front desk clerk refuses incomplete paperwork: no room number, no check-in. That refusal is a **NOT NULL constraint**.

The hotel also has a rule printed at the top: "one line per passport number." Two guests can't register under the same passport. That's a **UNIQUE constraint**, and if one box is designated *the* official identifier for a line — the thing you use to find that guest again — that's a **primary key**.

Now, there's a second book behind the desk: the **rooms register**, listing every room in the hotel. The guest line asks for a room number, and the clerk checks it against the rooms book before accepting the line. If you write room 902 and the hotel only has 40 rooms, the line goes in the bin. That cross-book check is a **foreign key** pointing at another table.

Two more details, and they're the ones most developers miss:

How are the lines *physically* arranged in the guest book? At most hotels, lines are simply added at the back in arrival order. Nobody re-sorts the book. That's called a **heap** — an unordered pile of rows. Some hotels instead keep the guest book itself permanently sorted by room number, so "everyone on floor 3" is one contiguous block you can read straight through. When the physical book itself is sorted by its official identifier, that's a **clustered index**. And either way, the clever desk keeps a set of card boxes out front — alphabetized by surname — where each card says which line number to jump to. Those card boxes are **secondary indexes**: copies of one column, sorted, with pointers to the real lines.

Finally: "which guests check out today?" is a question the desk answers fresh every morning. Nobody prints a new book for it. A saved question over existing books is a **view** — we'll get to that.

## 3. The Full Explanation — How It Actually Works

Strip the analogy away and here's what a table actually is: a grid where every column has a name and a fixed type, every row is one fact, and the database engine itself enforces the shape and the rules. Not the application. The engine.

That last part is the whole point. Your app can validate input all day, but tables live longer than any single app. Direct SQL sessions, cron jobs, analytics scripts, a second microservice, a manual fix during an incident — none of them pass through your Express middleware. Constraints declared on the table are the only rules that *every* writer must obey, because they run inside the database right before a row is stored. This is why senior engineers say "put the invariant in the database": application validation is a UX convenience, table constraints are the actual guarantee.

**Rows, columns, cells.** A column defines one attribute with one type — `email` is text, `total_cents` is an integer. Because the type is fixed per column, the engine knows exactly how big each value is, how to compare two values, and how to store them compactly. A row is one complete record across those columns. A cell is one row intersecting one column, and it either holds a valid value of that type or an explicit `NULL` — which means "unknown/not applicable," not zero and not empty string. Confusing `NULL` with those two is a classic bug factory (`NULL = NULL` isn't even true).

**Tables are supposed to be sets.** In relational theory, a relation is a *set* of rows, and sets don't contain duplicates. SQL relaxes this: with no constraints at all, a table will happily accept the identical row five times — I've verified this behavior directly. That's why real tables almost always declare a primary key: it makes "this row" addressable and restores set semantics. If you ever meet a table with no key at all, deduplicating it later is genuinely painful — you need tricks like `SELECT DISTINCT` into a new table or filtering by hidden system columns (`ctid` in PostgreSQL), because there is no legitimate way to say "delete one of the identical rows."

**Where the rows physically live.** Here's the detail that separates decent answers from great ones. PostgreSQL stores your table as a **heap**: rows scattered across 8KB pages in whatever order they landed, with no sorting whatsoever. Every index is a separate structure (usually a B-tree) that stores the indexed column's values plus a pointer to the row's physical location. So finding `WHERE email = 'ana@example.com'` via an index means: search the sorted index (fast), follow the pointer, fetch the row. MySQL's InnoDB does it differently — the table *is* a B-tree, physically organized by primary key (**clustered**), and secondary index entries store the primary key value instead of a physical pointer, using it to re-look-up the row. Consequence: in InnoDB your primary key should be short and preferably increasing (that's why auto-increment beats random UUIDs there — random keys force page splits everywhere and bloat every secondary index), while in PostgreSQL a random UUID PK costs you much less. Same logical table, very different physical behavior.

One more physical truth: **a table has no guaranteed row order**. Without `ORDER BY`, the database returns rows in whatever order is cheapest — heap scan order in PostgreSQL, often-but-not-always primary key order in InnoDB. Developers who test on tiny InnoDB tables see rows come back "in insert order," ship the assumption, and it breaks the day the query plan changes. Always `ORDER BY`.

**How tables relate.** Tables don't hold pointers in memory; they hold **keys**. Each table declares a primary key — the unique, non-null identifier for its rows ([primary keys](what-is-a-primary-key.md)). Another table references it with a [foreign key](what-is-a-foreign-key.md): `orders.customer_id REFERENCES customers(id)`. From then on the engine rejects any order whose customer doesn't exist, and refuses to delete a customer who still has orders (unless you declare `ON DELETE CASCADE` or similar). A `JOIN` is just the query-time operation that walks those key references and stitches rows back together — the relationships aren't magic, they're values that match. Many-to-many relationships (students ↔ courses) get their own small junction table holding pairs of foreign keys.

**When a table is the wrong tool.** A table wants data where every row has the same known shape. Three situations push back:

- Genuinely variable attributes (a product's per-category specs: "screen size" for TVs, "author" for books). Forcing each into its own column gives you a sparse mess; forcing them into an entity–attribute–value side-table destroys typing and queryability. A JSONB column inside an otherwise well-typed row is the honest middle ground — see [JSON vs JSONB](../postgresql/json-vs-jsonb.md). Rule: typed columns for the core, JSONB for the long tail you never filter on critically.
- Huge append-only event streams (clicks, sensor readings, billions of log lines). One monolithic table turns every cleanup into a brutal `DELETE` and every query into a giant scan. Partition or move to purpose-built storage — see [partitioning](what-is-partitioning.md).
- Output-shaped, denormalized reporting snapshots. That's not source-of-truth data; that's what views and materialized views are for.

**ALTER on a big table — the production tax.** The schema is enforced on every row, so changing the schema can mean touching every row:

- `ADD COLUMN` with no default, nullable: near-instant in PostgreSQL — it updates the catalog, doesn't rewrite rows. With a constant default, also fast since PG 11. MySQL 8.0 can do instant adds too, with position caveats.
- `SET NOT NULL`: PostgreSQL must scan the entire table to prove no NULL exists — full scan under a heavy lock. The safe pattern is `ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID` (instant), then `VALIDATE CONSTRAINT` (scan, but only a shared lock), then `SET NOT NULL` which reuses the validated check instantly.
- Changing a column's type (`integer` → `bigint`): rewrites the whole table and every index referencing it. On 200 million rows that's hours and effectively downtime, plus massive replication lag.
- Adding a foreign key: validates every existing row against the referenced table unless you do `NOT VALID` first and validate separately.
- MySQL's older story: `ALTER TABLE` frequently rebuilds the table, which is why shops run tools like `gh-ost` or `pt-online-schema-change` that copy the table in shadows and swap. Modern InnoDB does many operations `INPLACE`, but "online" still means "holds the table busy" — plan it off-peak either way.

The general pattern for big tables: add things nullable, backfill in batches from application code or a batched migration, then enforce strictness once the data is proven clean. See [schema migrations](what-is-schema-migration.md).

## 4. See It In Practice — Real Code or Queries

PostgreSQL syntax throughout (the constraint behavior was verified against SQLite, which enforces the same SQL-standard constraint semantics; the identity and JSONB bits below are PostgreSQL-specific).

Defining tables that enforce the contract — this schema would have caught every bug from section 1:

```sql
CREATE TABLE customers (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email       text        NOT NULL UNIQUE,   -- one account per email, always
    full_name   text        NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id  bigint   NOT NULL REFERENCES customers(id),          -- no ghost customers
    status       text     NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'paid', 'shipped', 'cancelled')),
    total_cents  integer  NOT NULL CHECK (total_cents >= 0),           -- integers, never floats, for money
    metadata     jsonb    NOT NULL DEFAULT '{}'::jsonb,                -- variable extras live here
    created_at   timestamptz NOT NULL DEFAULT now()
);
```

Watch the engine refuse garbage — regardless of which client sends it:

```sql
INSERT INTO customers (full_name) VALUES ('Forgot Email');
-- ERROR: null value in column "email" violates not-null constraint

INSERT INTO customers (email, full_name)
VALUES ('ana@example.com', 'Duplicate Signup');
-- ERROR: duplicate key value violates unique constraint "customers_email_key"

INSERT INTO orders (customer_id, status, total_cents)
VALUES (1, 'Paid', 5000);
-- ERROR: violates check constraint (the sync script's capital-P 'Paid' dies right here)

INSERT INTO orders (customer_id, total_cents) VALUES (999, 5000);
-- ERROR: violates foreign key constraint (customer 999 doesn't exist)
```

Reading across the relationship — the JOIN is just matching key values:

```sql
SELECT c.full_name, o.id AS order_id, o.status, o.total_cents
FROM customers c
JOIN orders o ON o.customer_id = c.id      -- walk the foreign key
WHERE o.created_at >= now() - interval '30 days'
ORDER BY o.created_at DESC;                 -- explicit order, never assumed
```

Changing shape safely on a big table — the staged pattern:

```sql
-- Step 1: instant, no rewrite, old rows just show NULL
ALTER TABLE orders ADD COLUMN promo_code text;

-- Step 2: backfill in batches from app/migration code (not one giant UPDATE)

-- Step 3: prove cleanliness cheaply, then lock in strictness
ALTER TABLE orders ADD CONSTRAINT orders_promo_code_not_null
    CHECK (promo_code IS NOT NULL) NOT VALID;
ALTER TABLE orders VALIDATE CONSTRAINT orders_promo_code_not_null;
```

And the escape hatch for genuinely untyped data, kept in a corner of an otherwise strict table:

```sql
SELECT total_cents, metadata->>'gift_message' AS gift_message
FROM orders
WHERE metadata ? 'gift_message';
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What actually is a table?**

It's the core structure of a relational database: a named grid of rows and columns where every column has a defined name and type, every row is one complete record of the same shape, and the engine enforces both the shape (types, nullability) and any declared rules (unique, check, foreign key) on every write, from every client. The important nuance beyond that definition: the table is the place where data integrity lives, because it's the only layer every writer must pass through. Application code validates requests; the table validates reality.

**Q: Can a SQL table contain duplicate rows?**

Yes, if you let it. Relational theory defines a relation as a set — no duplicates — but SQL only approaches that ideal when you declare constraints. A table with no primary key or unique constraint accepts byte-for-byte identical rows happily, and once duplicates exist they're hard to remove because you can't address one specific copy. In practice every real table should have a primary key precisely to prevent this, which also gives every row a stable handle for foreign keys and updates.

**Q: Where does a table's data physically live, and does it matter?**

In PostgreSQL, as an unordered heap: rows land in 8KB pages in arrival order, and every index is a separate B-tree holding column values plus pointers to row locations. In MySQL's InnoDB, the table itself is a B-tree sorted by primary key — a clustered layout — and secondary indexes store the primary key rather than a physical pointer, so lookups through them cost an extra hop down the main tree. It matters practically: InnoDB wants short, increasing primary keys (random UUIDs fragment the tree and inflate every secondary index), while PostgreSQL tolerates random PKs much better and instead makes you think about index bloat and dead tuples. And in neither engine can you rely on physical order in query results — that's what `ORDER BY` is for.

**Q: How do tables relate to each other?**

Through key values, not pointers. A parent table owns a primary key; child tables carry it as a foreign key column. The database then polices referential integrity continuously: no child row may reference a nonexistent parent, and deleting a referenced parent is blocked unless you've declared a behavior like `ON DELETE CASCADE`. One-to-many is a FK on the child; many-to-many needs a junction table holding two FKs; one-to-one is an FK that's also unique. At query time, joins reconstruct the relationships by matching those key values. This is the fundamental difference from document databases, where relationships are either embedded copies or client-side joins across collections.

**Q: What happens when you ALTER a huge production table?**

Depends entirely on the operation. Additive changes — adding a nullable column, or adding a column with a constant default on modern versions — are near-instant metadata edits. Anything requiring verification or rewriting is dangerous: `SET NOT NULL` forces a full scan under a restrictive lock, type changes rewrite the entire table and its indexes (hours on hundreds of millions of rows, plus replica lag), and adding a foreign key validates every existing row. The safe playbook is staged: add nullable, backfill in batches, attach a `NOT VALID` check constraint, validate it during low traffic, then tighten. On MySQL, historically you'd reach for gh-ost or pt-online-schema-change to avoid rebuilds. The senior signal is knowing "ALTER" is not one operation — it's a family ranging from free to outage-causing.

**Q: When would you not use a plain table — or not use only a table?**

Three honest cases. First, truly variable attributes: a `jsonb` column inside a typed row handles per-category product specs without an entity–attribute–value nightmare — but keep anything you filter, join, or constrain on in real columns. Second, massive append-only telemetry: partitioning (by range on time, typically) keeps pruning, retention, and query locality sane where one monolithic table would turn deletes and scans into emergencies. Third, derived report shapes: don't reshape your normalized source tables into wide denormalized ones for the dashboard — build views or materialized views over them instead.

**Q: How does a table differ from a view? From a materialized view?**

A table stores rows; it's the source of truth you write to. A view stores nothing — it's a saved query that executes fresh on every access, always current, never stale, but paying full query cost each time. A materialized view stores the *result* of its query as a real, readable snapshot — fast to select from, but frozen until you `REFRESH MATERIALIZED VIEW`, and in PostgreSQL that refresh takes a lock unless you use `CONCURRENTLY`. Mental test: "do I write facts here?" → table. "Do I need a reusable lens over facts?" → view. "Do I need a lens that's expensive to recompute but okay slightly stale?" → materialized view.

**Q: What does `NULL` mean in a cell, and how is it different from an empty string or zero?**

`NULL` means unknown or not applicable — the cell's answer doesn't exist yet. Zero and empty string are real values; `NULL` is the absence of one. Practically this leaks everywhere: comparisons with `NULL` yield unknown rather than true/false (so `WHERE promo_code != 'X'` silently drops NULL rows), aggregates skip NULLs (`COUNT(col)` vs `COUNT(*)`), and concatenating a NULL in many engines nullifies the result. Declare `NOT NULL` by default and permit NULL only when "unknown" is a genuine state of your domain — nullable columns are a decision, not a default.

## 6. The Traps — What Goes Wrong in Production

**"A table is basically a spreadsheet."**
Wrong because spreadsheets enforce nothing: any cell holds anything, formulas hide in cells, rows merge, and meaning comes from human convention. A table is the opposite — a rigid contract where the engine rejects mistyped, missing, or rule-breaking data before it's stored. What happens when you believe the spreadsheet story: you create tables with no constraints ("we'll validate in the API"), and within months the data is unqueryable garbage written by the five clients you forgot about. Fix: treat DDL as the integrity layer — types, NOT NULL, UNIQUE, CHECK, FK from day one; relaxing later is easy, tightening later requires the staged-migration dance.

**Relying on row order.**
The assumption: "rows come back in insertion order." Why it's wrong: heaps have no order, and even InnoDB's clustered layout only *tends* to return primary-key order — the moment a secondary index, sort optimization, or parallel scan changes the plan, order changes. What actually happens: pagination or grouping logic works in dev on 50 rows, breaks subtly in production at scale, and nobody can reproduce it. Fix: `ORDER BY` whenever sequence matters, ideally anchored on a unique tiebreaker (`ORDER BY created_at, id`) because sort keys alone aren't guaranteed unique either.

**Enforcing rules only in application code.**
The assumption: validation lives in the app, so the data is safe. Why it's wrong: the app is just one writer among many — migrations, scripts, other services, a psql session at 2am during an incident. What actually happens: the exact class of bug you validated against appears anyway, written by something that never touched your middleware. Fix: duplicate the critical invariants as table constraints. App validation improves error messages; database constraints guarantee correctness. They're not redundant — they serve different layers.

**Casual schema changes on big tables.**
The assumption: `ALTER TABLE` is quick like the dev database where it ran in milliseconds. Why it's wrong: several ALTER variants must scan or rewrite every row, under locks that block reads or writes. What actually happens: the migration holds an exclusive lock, every request queues behind it, connections pile up, the pool exhausts, and you've turned a schema tweak into an outage — with replicas lagging hours behind from the rewrite traffic. Fix: know your operation's cost class before running it, use the add-nullable → backfill → NOT VALID check → validate pattern, and rehearse on a production-sized copy.

**Storing money or identity carelessly.**
Two related mistakes. Floats for money: `0.1 + 0.2` doesn't equal `0.3` in binary floating point, and cents vanish silently across thousands of ledger rows until reconciliation fails. Random UUIDv4 primary keys on InnoDB: every insert lands at a random tree position, causing page splits and bloating every secondary index (which stores your fat PK). Fix: integer cents or `NUMERIC` for money; auto-incrementing or time-ordered IDs (UUIDv7-style) when you need InnoDB-friendly uniqueness.

## 7. Compare With Related Concepts

**Table vs view.** A table physically stores rows and is what you write to. A view stores only a query definition and runs it fresh on every access — always current, zero staleness, full cost per read. Rule: tables for facts, views for reusable lenses over facts.

**Table vs materialized view.** A materialized view physically stores the *output* of its query, so reads are fast but the snapshot is stale until refreshed (and refreshing has locking costs in PostgreSQL). Rule: if consumers can tolerate minutes of staleness in exchange for cheap reads of an expensive aggregation, materialize; otherwise view.

**Table vs spreadsheet.** The spreadsheet trusts humans to keep it tidy; the table makes disorder impossible. Types, required fields, uniqueness, and cross-references are enforced by the engine on every write. Rule: if more than one program writes the data, it was never a spreadsheet problem.

**Table vs collection (MongoDB).** A table enforces shape and cross-row guarantees centrally — every document... sorry, every *row* conforms. A MongoDB collection stores self-describing documents with optional per-collection validation, trading enforced uniformity for flexibility. Rule: shared facts with relationships and invariants → tables; independently shaped records queried together → documents. Deeper comparison lives in [collections](../mongodb/what-is-a-collection.md) and [SQL vs NoSQL](../mongodb/sql-vs-nosql.md).

**Table vs partitioned table.** Logically the same object to every query; physically split into pieces by a key (usually time). Partitions exist because one giant table makes retention and scanning brutal. Rule: start plain; partition when a single table's size breaks vacuum, indexing, or deletion workflows — see [partitioning](what-is-partitioning.md).

## 8. 🧠 The Memory Hook

A table is a pre-printed form, not a scratchpad: the columns are law, the rows are facts, and the database is the clerk who throws incomplete paperwork in the bin — no matter which department sent it. If your "table" accepts whatever anyone writes, you don't have a table; you have a landfill with column headers.
