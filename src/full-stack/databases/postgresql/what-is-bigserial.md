# What is BIGSERIAL

## 1. The Real-World Problem — When You Actually Hit This

It's a regular Tuesday. Your app has been live for four years. Suddenly checkout starts failing for every new customer, and the logs are full of the same error:

```txt
ERROR:  nextval: reached maximum value of sequence "events_id_seq" (2147483647)
```

Somebody wrote `id serial` in a migration during week one of the project and never thought about it again. The table records user events at around 900,000 rows a day, and 2,147,483,647 divided by 900,000 is about six and a half years. The counter finally walked its way up to the largest number a 32-bit integer can hold, and from that moment every insert into one of your busiest tables failed until someone intervened.

This is not a hypothetical. Real companies have hit int max on primary keys, and it's always ugly, because you can't just "add more room" in five minutes — every foreign key pointing at that column has to grow too, while production traffic hammers the table. The entire outage traces back to one word chosen on day one: `serial` instead of `bigserial`. To understand why that single word matters — and why the fix is more than swapping a type name — you have to know what bigserial actually creates under the hood. Most developers who use it daily have never looked.

## 2. The Analogy — Make the Mechanic Obvious

Think of a deli counter. Next to the counter sits a small metal ticket dispenser. A customer walks up, pulls the next ticket, and gets served under that number. Now map every piece:

The dispenser itself is the **sequence** — a separate little object living in the database next to your table. Its only job is handing out the next number, and it does one thing perfectly: it never hands out the same number twice, and it never rewinds.

The clerk automatically pulling a ticket for every arriving customer is the column's **default**: when your insert doesn't provide an id, Postgres quietly calls the dispenser for you.

The store rule "nobody gets served without a ticket" is **NOT NULL** — every row must have a number.

The dispenser being **bolted to that specific counter** is sequence ownership: drop the table, and the dispenser goes with it. It won't linger as junk.

Now the details that cause real incidents. The dispenser's paper roll is printed with a **last number**. A small corner shop prints rolls ending at 2,147,483,647 — that's `serial` (an `integer` column). A stadium-scale stand prints rolls ending at 9,223,372,036,854,775,807 — that's `bigserial` (a `bigint` column). Same machine, longer roll.

And here's the quirk everyone learns the hard way: if a customer pulls a ticket, looks at the menu, and walks out, the shop does **not** stick the ticket back in. The number is spent forever. That's a rolled-back transaction — the sequence never takes numbers back, so gaps appear even though no row was ever deleted.

Finally, imagine a manager who puts up a sign saying "handwritten numbers forbidden — tickets only," but lets staff break the rule with special approval. That sign is `GENERATED ALWAYS AS IDENTITY`, and the special approval is `OVERRIDING SYSTEM VALUE`. We'll get to why that sign exists.

## 3. The Full Explanation — How It Actually Works

Here's the part almost nobody knows: **bigserial is not a data type**. PostgreSQL has no native `bigserial` type stored in your table. It's a macro — a shorthand that makes the database run several statements for you. Writing this:

```sql
CREATE TABLE orders (
    id bigserial PRIMARY KEY,
    customer_email text NOT NULL
);
```

is exactly equivalent to Postgres running this:

```sql
CREATE SEQUENCE orders_id_seq;

CREATE TABLE orders (
    id bigint NOT NULL DEFAULT nextval('orders_id_seq'),
    customer_email text NOT NULL
);

ALTER SEQUENCE orders_id_seq OWNED BY orders.id;
```

Four things happened, and each one matters. A standalone counter object called a **sequence** was created. Your id column became a plain `bigint` — eight bytes, ranging from minus 9.2 quintillion to plus 9.2 quintillion. The column got a default that calls `nextval()` on the sequence whenever you don't supply an id. And the sequence was marked as owned by the column, so it dies with the table. `NOT NULL` rides along automatically. That's the entire trick. `serial` is the identical macro with `integer` (four bytes, topping out at 2,147,483,647) instead of `bigint`; `smallserial` uses `smallint`.

One subtlety explains our opening outage precisely: modern Postgres creates the sequence *typed* to match its column, and it clamps the sequence's own maximum to the column's limit. So a `serial` column's sequence literally stops at 2,147,483,647 and refuses to go further — that's why the error names the sequence, not the column.

Do the math on those limits, because interviewers love this. An `integer` gives you ~2.15 billion rows. At 100,000 inserts a day that's about 59 years — fine. At a million a day it's under 6 years — not fine for logs, events, sessions, notifications, or join tables in a busy system. A `bigint` gives you ~9.2 quintillion. Even writing a billion rows a day, you'd run out in roughly 25 million years. The extra cost is four bytes per row and slightly larger indexes. On anything with real write volume, that's the cheapest insurance in database design.

Now the behavior that surprises people: **sequences are non-transactional by design**. `nextval()` does not participate in the transaction around it. If your transaction inserts a row taking id 104 and then rolls back, the row vanishes but 104 is burned — the next insert gets 105. The same happens when a connection dies mid-insert, when a session pre-allocates a cache of numbers it never uses, and when concurrent inserts interleave (transaction A can grab id 100 but commit *after* transaction B took 101, so id order is not commit order). This is deliberate: making the dispenser transactional would mean every insert queues behind a global lock waiting to find out if some other transaction lives or dies. Postgres chose speed and independence over prettiness, which is the right trade for a technical key — as long as you never build business meaning on top of it.

Which brings us to the modern replacement. Because serial/bigserial grew as a Postgres-only convenience (they exist nowhere in the SQL standard, and MySQL calls this concept `AUTO_INCREMENT`), PostgreSQL 10 introduced **identity columns**, which are the standard way to say the same thing:

```sql
id bigint GENERATED ALWAYS AS IDENTITY
```

You get the same sequence-backed mechanics, but with cleaner ownership, standard syntax, and an explicit knob for whether humans may insert their own ids. `GENERATED ALWAYS` forbids manual id inserts outright (unless you say `OVERRIDING SYSTEM VALUE`), while `GENERATED BY DEFAULT` allows them silently — which is basically serial behavior. For new schemas today, identity is the recommended default; serial and bigserial remain supported and are what many ORMs emit, so you'll meet them constantly either way.

One more boundary so you never oversell it: the sequence guarantees *distinct* freshly-generated values, but uniqueness is enforced by the primary key constraint, not the sequence. Nothing about a default stops a human from inserting a duplicate id by hand into an unconstrained column. The constraint is the law; the sequence is just the polite way most rows get their number.

## 4. See It In Practice — Real Code or Queries

**The modern default: identity.**

```sql
-- New table, done the SQL-standard way (PostgreSQL 10+)
CREATE TABLE invoices (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id bigint NOT NULL REFERENCES customers(id),
    total_cents bigint NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO invoices (customer_id, total_cents) VALUES (42, 19900); -- fine, id auto-assigned

-- GENERATED ALWAYS refuses hand-written ids:
INSERT INTO invoices (id, total_cents) VALUES (9999, 100);
-- ERROR: cannot insert a non-DEFAULT value into column "id"

-- Data loads and migrations can force it through, deliberately:
INSERT INTO invoices (id, total_cents) OVERRIDING SYSTEM VALUE VALUES (9999, 100);
```

**Proving that gaps are normal.**

```sql
BEGIN;
INSERT INTO invoices (customer_id, total_cents) VALUES (7, 500);  -- takes id, say, 101
ROLLBACK;                                                          -- row gone, id 101 burned

INSERT INTO invoices (customer_id, total_cents) VALUES (8, 600);  -- gets id 102
-- The hole at 101 is expected behavior, not corruption.
```

**Resyncing a sequence that fell behind the data** (after bulk-copying rows with explicit ids):

```sql
SELECT setval(
    pg_get_serial_sequence('invoices', 'id'),      -- finds the sequence backing the column,
    COALESCE((SELECT MAX(id) FROM invoices), 0) + 1,  -- jump past the highest existing id,
    false                                              -- and make the NEXT call return exactly that
);
```

**Watching how close you are to the ceiling** — the check nobody ran in our opening story:

```sql
SELECT sequencename,
       last_value,
       max_value,
       round(100 * last_value::numeric / max_value, 4) AS pct_used
FROM pg_sequences
WHERE schemaname = 'public'
ORDER BY pct_used DESC;
```

If any row crosses even 50%, you want a migration scheduled, not a surprise at 2 AM.

**The emergency fix when a `serial` column actually runs out** — widen the sequence first, then the column, then every foreign key that points at it:

```sql
ALTER SEQUENCE events_id_seq AS bigint MAXVALUE 9223372036854775807;
ALTER TABLE events ALTER COLUMN id TYPE bigint;
-- repeat the ALTER ... TYPE bigint for every table referencing events(id)
```

These `ALTER`s take heavy table locks, so on a large busy table this is a planned migration with maintenance windows or lock-timeout tooling — not a Friday-evening one-liner. Which is exactly why you pick `bigint` on day one instead.

## 5. Interview Questions — All of Them, Done Properly

**Q: What does `bigserial` actually create behind the scenes?**

Three coordinated pieces, because it's a macro, not a type: a `bigint` column declared `NOT NULL`, a dedicated sequence object whose default maximum matches the bigint range, and a `DEFAULT nextval('that_sequence')` on the column, with the sequence owned by the column so it's dropped along with the table. Saying "it's an auto-incrementing bigint" is the junior answer; walking through the sequence-plus-default-plus-ownership expansion is the senior answer, because every operational quirk — gaps, resyncing, exhaustion errors naming the sequence — falls out of that structure naturally.

**Q: What's the difference between `serial` and `bigserial`, and when does it actually matter?**

Same macro, different column width: `serial` creates an `integer` capped at 2,147,483,647 rows' worth of headroom, `bigserial` creates a `bigint` capped around 9.2 quintillion. It matters the moment write volume meets time. At a million rows a day, `serial` dies in under six years; at 100k a day it lasts decades. The cruel part is the failure mode: the table works flawlessly for years, then every insert fails at once, and the fix requires widening the column plus every foreign key referencing it under heavy locks. Rule of thumb: anything append-heavy or long-lived gets `bigint` from birth, because the four bytes you save per row are nothing next to a mid-life migration.

**Q: If no rows were ever deleted, why are there gaps in my ids?**

Because the sequence is non-transactional on purpose. `nextval()` hands out a number immediately and permanently, regardless of whether the surrounding transaction commits. Rollbacks, crashed connections, cached-but-unused sequence values, and concurrent inserts all consume numbers without producing rows. Postgres does this so inserts never serialize behind a global counter lock — a transactional dispenser would destroy insert concurrency. The follow-up insight worth volunteering: since a lower id can commit *after* a higher one, id order isn't even a reliable proxy for event order; if you need ordering, sort by `created_at` (or a timestamp column), not by id.

**Q: Should new tables use `bigserial` or `GENERATED ALWAYS AS IDENTITY`?**

Identity, as of PostgreSQL 10 onward. You get the same sequence-backed mechanics, but identity is the SQL-standard construct, it's portable across databases that speak the standard, and it separates policy cleanly: `GENERATED ALWAYS` blocks accidental manual id inserts that would otherwise collide later, while `GENERATED BY DEFAULT` behaves like serial if you want that. Bigserial remains completely supported and is what many ORMs generate, so knowing both matters — but for hand-written DDL today, identity is the defensible default, and being able to explain *why* (standard, explicit insert policy, cleaner ownership) is the real point of the question.

**Q: Production is throwing "reached maximum value of sequence" — walk me through the recovery.**

First, contain: inserts are failing now, so identify the sequence with `pg_sequences`, confirm it's pinned at its max. The durable fix is widening: `ALTER SEQUENCE ... AS bigint` to lift its ceiling, then `ALTER COLUMN id TYPE bigint` on the table, then the same type change on every foreign key column referencing it — miss one and you've traded insert failures for broken joins or silent cast overhead. Those alters take strong locks, so on a big table you schedule it, batch it, or use lock-timeout-and-retry tooling. Then close the loop operationally: alert on sequence fill percentage, because this failure is 100% predictable from `last_value / max_value` months in advance. The best answer mentions that the whole incident was avoidable with `bigserial` or identity at creation time.

**Q: Does bigserial guarantee my ids are unique?**

Not by itself — and this trips up people who conflate convenience with enforcement. The sequence guarantees that *values it generates* are distinct and increasing. Uniqueness of the column comes from the primary key (or unique) constraint, which rejects duplicates no matter where they came from. Remove the constraint and keep the default, and two manual inserts with the same id sail right through alongside auto-generated ones. The precise mental model: the sequence is the source most rows use, the constraint is the rule all rows obey.

**Q: Any downside to exposing these sequential ids in URLs and APIs?**

They leak information. `/orders/14872` tells a competitor roughly how many orders you've processed; combined with another endpoint created minutes later, it leaks growth rate. Sequential ids also make enumeration attacks trivial — an attacker can iterate `/users/1` through `/users/500000` looking for authorization holes (IDOR), because you've handed them a complete address list. Note the fix usually isn't hiding the primary key internally — it's adding a separate public identifier, typically a random UUID, for anything user-visible, while keeping the small fast bigint for joins and storage. If ids stay purely internal (never in URLs, exports, or payloads), sequence-based keys lose most of their downsides.

## 6. The Traps — What Goes Wrong in Production

**Expecting gapless ids.** The wrong assumption: ids behave like a row counter, so a gap means a deleted row or lost data. Reality: the sequence burns numbers on every rollback, crash, and cache miss whether or not a row survives — that's the price of not serializing every insert behind a lock. What goes wrong when you assume otherwise: someone builds invoice numbering or audit reconciliation on top of the primary key, auditors ask about the holes, and the team discovers there is no way to make a sequence gapless without destroying insert concurrency. The fix: treat generated ids as opaque row identifiers, nothing more. If you legally need consecutive invoice numbers, generate them at billing time from a dedicated counter (with locking or an atomic update), separate from the table's primary key.

**The `OVERRIDING SYSTEM VALUE` footgun.** With `GENERATED ALWAYS AS IDENTITY`, seed scripts and data migrations that insert explicit ids suddenly fail with "cannot insert a non-DEFAULT value into column." Developers google, find `OVERRIDING SYSTEM VALUE`, sprinkle it onto the statement, and move on — and that's where the second half bites: the sequence has no idea those manual rows exist. If you hand-inserted id 50000 while the sequence sat at 300, the next ~49,700 auto-inserts succeed, then one ordinary Tuesday `nextval` reaches 50000 and every insert fails with a duplicate key error that seems to come from nowhere. The fix is discipline: after any insert that bypasses the generator, resync immediately with `setval(pg_get_serial_sequence(...), max(id) + 1, false)` — or wrap bypasses in reviewed migration scripts rather than ad-hoc psql sessions.

**Sequences left out of sync after copies and restores.** Copying rows between environments, cloning a subset of production data, or rebuilding a table from a dump of rows (rather than a proper `pg_dump`, which handles sequence positions correctly) leaves the sequence wherever it happened to be — often near zero. The first auto-insert then tries id 1, hits the row you copied in, and fails with `duplicate key value violates unique constraint`. It's disorienting because the column "obviously" auto-increments. The fix is the same resync query as above; the prevention is treating sequence position as part of the data — any process that moves rows must move or recompute the counter too.

**Defaulting to `serial` out of habit.** The assumption: "our table will never hit 2 billion rows." The reality: estimates made at project start age badly, and the tables that overflow are rarely the ones you predicted — they're events, tokens, webhook deliveries, join tables, anything per-request. What happens: the six-year time bomb from section 1. The fix costs nothing today: `bigint` everywhere a key might grow, or at minimum a quarterly glance at `pg_sequences` fill percentages.

## 7. Compare With Related Concepts

**`bigserial` vs `serial`** — identical macros, different widths: `bigint` (8 bytes, ~9.2 quintillion) versus `integer` (4 bytes, ~2.15 billion). Rule: new tables with meaningful or unpredictable write volume get `bigserial`; the storage difference is negligible.

**`serial`/`bigserial` vs `GENERATED ALWAYS AS IDENTITY`** — same runtime machinery (column + sequence + default), different declaration: serial is a legacy Postgres-only macro, identity is the SQL-standard spelling with explicit control over manual inserts and cleaner ownership semantics. Rule: new hand-written DDL uses identity; serial knowledge matters because ORMs and old schemas are full of it.

**Sequence-based ids vs [UUID in PostgreSQL](what-is-uuid-in-postgresql.md)** — the sequence hands out small, ordered, locally-unique numbers; UUIDs are large (16-byte), unordered-looking, and unique across databases, services, and offline clients. Ordered keys make compact, fast B-tree indexes and easy sorting; UUIDs enable generating ids before the insert and merging data from independent systems, at the cost of fatter indexes (random UUIDv4 values scatter entries across the tree, though time-ordered UUIDv7 softens this). Rule: internal surrogate keys in one database → identity/bigserial; ids minted outside the database, merged across systems, or shown to the world where guessability is a risk → UUID, ideally as a separate public column.

All of these sit on top of the numeric types themselves — see [PostgreSQL data types](what-are-postgresql-data-types.md) for the full width-and-range picture, and [What is SERIAL](what-is-serial.md) for the sibling macro this page generalizes.

## 8. 🧠 The Memory Hook

Bigserial isn't a type — it's three commands in a trench coat: a bigint column, a never-rewinding ticket dispenser, and a rule that every row must pull a ticket. The roll never rewinds (gaps are normal), the small roll ends at 2,147,483,647 (serial's cliff), and if someone hand-writes numbers behind the dispenser's back, resync it before the machine catches up.
