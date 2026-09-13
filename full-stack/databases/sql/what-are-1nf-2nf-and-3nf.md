# What are 1NF, 2NF, and 3NF

## 1. The Real-World Problem — When You Actually Hit This

Your team runs an online store. Orders live in one big table, and every order row carries the customer's name, email, and city right next to the order data. It's been fine for months. Then marketing runs a re-engagement campaign, and a customer named Ana opens a support ticket: "I updated my email two weeks ago — why did your email go to my old address?"

You dig in. Ana changed her email in her profile, but her email was copied onto eleven order rows, and the migration script backfilling profiles only touched ten of them. So the same customer now exists in your database with two different emails, and nothing ever complained. Worse, when finance asks "how many distinct customers do we have?", you get different answers depending on whether you count `customers` or count distinct emails in `orders`.

This is the exact disease 1NF, 2NF, and 3NF were invented to cure. When the same fact lives in more than one place, nothing forces the copies to agree — and eventually one of them lies. The three normal forms are just three increasingly strict ways to guarantee **one fact, one place**. They also kill two quieter bugs: the *insert anomaly* (you can't record a brand-new product until someone orders it, because products have no table of their own) and the *delete anomaly* (Ana cancels her last order, the row disappears, and your company forgets she exists).

## 2. The Analogy — Make the Mechanic Obvious

Picture a school registrar's office that tracks enrollments on paper cards. One card per enrollment. Cards get bigger and messier over time — and the mess maps perfectly onto the three normal forms.

First mess: some boxes hold more than one thing. Under "phone" a clerk wrote "555-0101 / 555-0199". Under "days" someone wrote "Mon, Wed, Fri". Now the receptionist who needs "everyone with phone 555-0199" has to read every card and split text by hand. The fix — one box, one value; one card per day for schedules — is exactly **1NF**: no multi-value cells, no repeating groups.

Second mess: cards are identified by student + course (that pair is the card's key). But each card also prints the course's room and the instructor's office hours — identical text on all forty cards for BIO101. When BIO101 moves rooms, a clerk updates thirty-nine cards and misses one. Now two official cards disagree about where biology meets. The fix — course facts live on a course card, referenced by code — is exactly **2NF**: every non-key fact must depend on the *whole* key, not just one part of it.

Third mess: each card prints the student's ZIP code and their city. City always follows from ZIP — the clerk literally copies it from a ZIP-code reference book. One tired clerk types the wrong city for a known ZIP, and now the same ZIP maps to two cities across the filing cabinet. The fix — cards carry the ZIP, the ZIP→city mapping lives once in the reference book — is exactly **3NF**: no non-key fact may depend on another non-key fact.

Notice what all three fixes have in common: they don't add information. They rearrange the same facts so every fact is written down exactly once, and anything you need again you reach via a reference. That's the entire idea.

## 3. The Full Explanation — How It Actually Works

The one building block behind all three forms is a **functional dependency**. In plain words: "if I know X, I know exactly one Y." Know the order ID → you know its total. Know the email → you know the customer's city. Know (order, product) → you know the quantity ordered. Every normal form is a rule about which facts are allowed to depend on which other facts.

Normal forms apply in sequence — you can't claim 3NF without passing 1NF and 2NF. Here's the ladder, using the registrar's language:

**1NF — atomic values, unique rows.** Every column holds a single value (no `"2x keyboard, 1x monitor"` stuffed in one cell), no column repeats across the row (`item_1`, `item_2`, `item_3` columns are banned too), and every row is identifiable, which in practice means the table has a primary key. Why so strict? Because a database can only filter, join, index, and enforce integrity on whole values. A cell containing two phone numbers is invisible to `WHERE phone = ...` unless every reader agrees on string-splitting conventions — and the database can't help you enforce them.

**2NF — depend on the whole key.** Formally: be in 1NF, and every non-key column must depend on the entire primary key, not a part of it. Here's the detail almost everyone misses: this rule can only be violated by a table whose primary key is composite (made of two or more columns). If your key is a single column, every non-key column trivially depends on the whole key, because "part of the key" and "the whole key" are the same thing. Partial dependency is the formal term: `customer_email` depending only on `order_id` inside a table keyed by `(order_id, product_id)`.

**3NF — depend on nothing but the key.** Be in 2NF, and no non-key column may depend on another non-key column. That's a **transitive dependency**: `order_id → customer_email → customer_city`. The chain is the bug. Even though `order_id` legitimately determines the city (through the customer), storing the city next to the order creates a second copy of a fact that belongs to the customer — and second copies drift.

There's a famous mnemonic that compresses the whole ladder: every non-key column must depend on "**the key (1NF), the whole key (2NF), and nothing but the key (3NF)** — so help me Codd."

Why does decomposition actually work? Because splitting a table along its functional dependencies is lossless: the original wide row can always be rebuilt exactly by joining the pieces back. You trade one wide row for a few narrow ones plus references, and the database stitches them together on demand. Nothing is lost; redundancy is gone.

What do you pay? Joins. The normalized shape answers "what did Ana buy?" with a three-table join instead of reading one row. On an OLTP system (your app's day-to-day reads and writes) that cost is small and the write-side correctness is enormous, which is why 3NF is the default for transactional schemas. On read-heavy analytical systems, teams deliberately denormalize and accept update complexity to avoid joins across billions of rows. The normal forms tell you what the *clean* shape is — so that when you deviate, it's a measured decision, not an accident.

Two boundaries worth knowing. First, 3NF isn't the ceiling: **BCNF** tightens it to "every determinant must be a candidate key." The classic case: `(student, subject, teacher)` keyed by `(student, subject)`, where each teacher teaches exactly one subject (`teacher → subject`). Teacher is a non-key determinant, yet the table passes 3NF because `subject` is part of a candidate key — so 3NF shrugs and BCNF splits the table. Interviewers love this as a follow-up; knowing it exists puts you ahead of most candidates. Second, normalization is a *structural* safeguard. Foreign keys and CHECK constraints guard *values*; normal forms guard *shape*. You want both.

## 4. See It In Practice — Real Code or Queries

Let's evolve the store's table step by step. Syntax below is PostgreSQL-flavored; the modeling ideas are engine-neutral.

**Start — the unnormalized table everyone has shipped once:**

```sql
CREATE TABLE orders_wide (
  order_id       INTEGER PRIMARY KEY,
  order_date     DATE,
  customer_name  TEXT,
  customer_email TEXT,
  customer_city  TEXT,
  items          TEXT   -- "2x Keyboard, 1x Monitor" — a whole cart in one cell
);

INSERT INTO orders_wide VALUES
  (1001, '2026-08-01', 'Ana Souza',  'ana@example.com',      'Pune',  '2x Keyboard, 1x Monitor'),
  (1002, '2026-08-02', 'Ravi Menon', 'ravi@example.com',     'Nagpur','1x Webcam'),
  (1003, '2026-08-03', 'Ana Souza',  'ana.souza@example.com','Pune',  '1x USB Hub');
```

Rows 1001 and 1003 are the same person whose email drifted. The `items` cell is unqueryable: "how many keyboards sold?" requires string surgery in application code.

**Step 1 — reach 1NF: one value per cell, one row per fact.**

```sql
CREATE TABLE orders_1nf (
  order_id       INTEGER,
  product_name   TEXT,
  quantity       INTEGER,
  customer_name  TEXT,
  customer_email TEXT,
  customer_city  TEXT,
  PRIMARY KEY (order_id, product_name)   -- composite key: one row per product per order
);
```

| order_id | product_name | quantity | customer_name | customer_email | customer_city |
|---|---|---|---|---|---|
| 1001 | Keyboard | 2 | Ana Souza | ana@example.com | Pune |
| 1001 | Monitor | 1 | Ana Souza | ana@example.com | Pune |
| 1002 | Webcam | 1 | Ravi Menon | ravi@example.com | Nagpur |
| 1003 | USB Hub | 1 | Ana Souza | ana.souza@example.com | Pune |

Every cell is now searchable and joinable. But look closely — `customer_email` is identical on both of Ana's rows, and it only depends on `order_id`, half of the composite key. Same for `product` facts hiding implicitly in names.

**Step 2 — reach 2NF: kill partial dependencies on the composite key.**

Split facts that belong to only one part of the key into their own tables:

| orders | | | | order_items | | |
|---|---|---|---|---|---|---|
| order_id | date | customer_name | customer_email | order_id | product_name | quantity |
| 1001 | 2026-08-01 | Ana Souza | ana@example.com | 1001 | Keyboard | 2 |
| 1002 | 2026-08-02 | Ravi Menon | ravi@example.com | 1001 | Monitor | 1 |
| 1003 | 2026-08-03 | Ana Souza | ana.souza@example.com | 1002 | Webcam | 1 |
| | | | | 1003 | USB Hub | 1 |

Customer facts now exist once per order instead of once per line item. But `orders` still has a hidden chain: `order_id → customer_email → customer_city`. Ana's city is copied onto every order she'll ever place.

**Step 3 — reach 3NF: kill transitive dependencies among non-key columns.**

Move customer facts to a customer table; orders keep only a reference:

```sql
CREATE TABLE customers (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name  TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,        -- the UNIQUE constraint is what makes email→name impossible to duplicate
  city  TEXT NOT NULL
);

CREATE TABLE products (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name        TEXT NOT NULL UNIQUE,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0)
);

CREATE TABLE orders (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT NOT NULL REFERENCES customers(id),
  ordered_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  order_id         BIGINT NOT NULL REFERENCES orders(id),
  product_id       BIGINT NOT NULL REFERENCES products(id),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL,  -- the price actually charged; see the nuance below
  PRIMARY KEY (order_id, product_id)
);
```

(Production carts often give each line its own `id` so the same product can appear on two lines with different promo pricing; the composite-key version above is the classic textbook shape and is what interviewers expect.)

Now fixing Ana's email is one row in one place:

```sql
UPDATE customers SET email = 'ana.souza@example.com' WHERE id = 17;

-- The old wide table needed this — and prayed it caught every copy:
UPDATE orders_wide SET customer_email = 'ana.souza@example.com'
WHERE customer_email = 'ana@example.com';
```

And answering "what's in order 1001" is a join, not string parsing:

```sql
SELECT c.name,
       p.name   AS product,
       oi.quantity,
       oi.unit_price_cents
FROM orders o
JOIN customers c    ON c.id = o.customer_id
JOIN order_items oi ON oi.order_id = o.id
JOIN products p     ON p.id = oi.product_id
WHERE o.id = 1001;
```

One deliberate-looking "violation" to understand before an interviewer catches you off guard: `unit_price_cents` sits on `order_items` even though `products.price_cents` exists. That is *not* a 3NF problem. The catalog price is a fact about the product *today*; the unit price is a fact about *that purchase* — what we actually charged, discounts included. It depends on the whole key `(order_id, product_id)` and cannot be derived from the product row, because prices change. Confusing "a fact I'm choosing to snapshot" with "a redundant copy that will drift" is exactly the judgment call senior interviews probe.

## 5. Interview Questions — All of Them, Done Properly

**Q: Explain 1NF, 2NF, and 3NF in your own words.**

They're three levels of "one fact, one place." 1NF: every cell holds exactly one value, no repeating groups, every row uniquely identifiable — so the database can search, join, and enforce things on whole values. 2NF: in a table with a composite primary key, every non-key column must depend on the entire key, not just one column of it — otherwise course-level facts get copied onto every enrollment row. 3NF: no non-key column may depend on another non-key column — no chains like order → email → city, because each link in the chain beyond the first is a redundant copy waiting to disagree. The mnemonic: every non-key attribute depends on the key, the whole key, and nothing but the key.

**Q: What actually goes wrong without normalization?**

Three anomalies. Update anomaly: a fact stored on many rows gets partially updated — our Ana story, two emails for one customer. Insert anomaly: you can't store a fact that has no parent row yet — a new product can't exist until someone orders it if products only live inside order rows. Delete anomaly: deleting the last row silently destroys an unrelated fact — canceling Ana's final order erases her from the system. All three are the same root cause: one fact, many homes, no enforcement that the homes agree.

**Q: What is a functional dependency?**

It's the atom the whole theory is built on: column(s) X functionally determine Y if each X value maps to exactly one Y value. `order_id → order_date`; `(order_id, product_id) → quantity`; `email → city`. Say it as "X pins down exactly one Y." Then every normal form becomes a sentence about allowed dependencies: 2NF forbids Y depending on *part* of the key, 3NF forbids Y depending on *another non-key column*, and BCNF demands that anything which determines something else must itself be a candidate key.

**Q: What's the real difference between 2NF and 3NF?**

Which wrong dependency they forbid. 2NF targets *partial* dependencies: a non-key column hanging off only part of a composite key — `customer_email` depending on `order_id` inside a table keyed by `(order_id, product_id)`. 3NF targets *transitive* dependencies: key → A → B, where B hangs off another non-key column instead of the key. Quick test: 2NF violations need a composite key to exist at all; 3NF violations can happen even with a single-column primary key, because they're about non-key columns determining each other.

**Q: Can a table with a single-column primary key violate 2NF?**

No — and saying this cleanly is a strong signal. With a single-column key there is no "part of the key," so every non-key column either depends on the whole key or on nothing legitimate. Single-key tables skip straight from 1NF to checking 3NF. Many candidates recite "no partial dependencies" without noticing the rule is vacuous for their table, which tells the interviewer they memorized rather than understood.

**Q: Is 3NF always the goal? Would you ever stop earlier or go past it?**

3NF is the default target for transactional (OLTP) schemas because it eliminates modification anomalies at a modest join cost. You'd deliberately denormalize past it — cache an aggregate, snapshot a price, replicate customer fields into an orders table — when a read path is provably hot and you can manage the sync (usually via the write path or a scheduled job), accepting that consistency becomes your job instead of the schema's. You'd rarely stop *before* 3NF in an OLTP schema; 1NF-only designs are the legacy messes this whole topic exists to fix. And if asked what's beyond 3NF: BCNF, which requires every determinant to be a candidate key and fixes edge cases 3NF tolerates.

**Q: What is BCNF, and how is it different from 3NF?**

3NF allows one loophole: a non-key column X can determine another column Y as long as Y is part of some candidate key. BCNF closes it: X must be a candidate key, period. Canonical example — `(student, subject, teacher)` with key `(student, subject)`, given the rule that each teacher teaches exactly one subject. Then `teacher → subject`: teacher is a determinant that isn't a candidate key, yet the table is in 3NF because `subject` is prime (part of a candidate key). BCNF decomposes it into `(teacher, subject)` and `(student, teacher)`. In practice, most 3NF tables are already BCNF; the gap only shows up with overlapping composite candidate keys.

**Q: Doesn't normalization hurt performance with all those joins?**

Sometimes, and that's the honest trade-off — but say *where*. Normalization makes writes cheaper and safer (one row changes instead of many) and reads slightly more expensive (join instead of one-row lookup). At transactional scale with indexes on the foreign keys, a two- or three-table join on indexed columns is cheap — milliseconds. The places teams denormalize are read-hot paths at large scale: dashboards, feeds, reporting aggregates, where joining billions of rows per request is the bottleneck. The senior framing: normalization defines the correct source of truth; denormalized copies are caches of that truth, and every cache needs an invalidation story.

**Q: Is storing `unit_price_cents` on `order_items` denormalization?**

No, and this question separates people who pattern-match from people who reason. Denormalization means duplicating a fact that exists elsewhere and could drift. The catalog price in `products` describes today's price; the line item's unit price records what was actually charged at purchase time — a different fact that cannot be derived retroactively once prices change. It depends on the whole key `(order_id, product_id)` and satisfies 3NF. Snapshotting volatile facts onto immutable records is correct modeling, not redundancy.

## 6. The Traps — What Goes Wrong in Production

**The comma-separated column.** Wrong assumption: stuffing `"2x Keyboard, 1x Monitor"` in one cell is fine because it's readable. Why it's wrong: a database can only index, join, and constrain whole values — that cell is opaque to `WHERE`, `JOIN`, and foreign keys. What actually happens: every consumer parses strings in application code with subtly different rules, "how many keyboards sold?" becomes a full-table scan plus fragile parsing, and referential integrity is impossible — delete a product and stale names survive forever. The fix is 1NF: one row per line item, referencing a product table. This is the single most common real-world 1NF violation, and calling it out with a war story lands well in interviews.

**"Normalized means no duplicate data anywhere."** Wrong assumption: after 3NF, values never repeat. Why it's wrong: foreign keys and join columns repeat constantly — Ana's `customer_id` appears on every order, correctly. What normalization removes is duplication of *dependent facts* (her email and city), not repetition of *identifiers*. What actually happens if you internalize the wrong version: you start inventing junction tables to eliminate harmless ID repetition, producing join spaghetti nobody can query.

**Hunting 2NF violations in single-key tables.** Wrong assumption: every table needs a partial-dependency audit. Why it's wrong: partial dependencies require a composite key — with one key column there's nothing to be partial about. What actually happens: time wasted, or worse, "fixes" that split tables along imaginary dependencies. The efficient habit: composite key → check 2NF then 3NF; single key → check 3NF only.

**Treating normalization as a performance optimization.** Wrong assumption: normalizing will speed the app up. Why it's wrong: normalization optimizes for *write correctness*, and usually costs read speed via joins. What actually happens: a team normalizes a hot reporting table, queries slow down, and they conclude normalization is bad — when the real answer was "this workload wanted a denormalized read model fed from the normalized core." Normalize the source of truth; denormalize outward, deliberately, where measurement says so.

**Over-normalizing into join hell.** The inverse mistake: splitting `city` into a `cities` table with surrogate IDs, `zip_codes` into its own table, every low-cardinality attribute into a lookup table — until answering "where does this customer live?" takes four joins for data that never changes independently. The 3NF test for splitting is genuine independence: does the child fact have its own lifecycle and its own facts (like `zip → city` mappings do)? If it's just a label that rides along with its parent, leave it inline. Judgment, not rule-recitation, is the senior signal.

## 7. Compare With Related Concepts

**Normalization vs [denormalization](what-is-denormalization.md).** Normalization structures data so every fact is written once and anomalies are structurally impossible; denormalization intentionally reintroduces copies to serve specific read paths fast. They're not enemies — mature systems normalize the source of truth, then maintain measured denormalized views off it. Rule: default to 3NF for transactional tables; denormalize only a named, measured read path, and own its refresh strategy.

**3NF vs BCNF.** Both ban partial and transitive dependencies. BCNF additionally requires that *any* column that determines another column be a candidate key, closing the "determinant of a prime attribute" loophole 3NF permits. Rule: 3NF is your working standard; reach for BCNF reasoning when an interviewer pushes on overlapping composite candidate keys.

**Normalization vs constraints and foreign keys.** Different layers of integrity. Normal forms control *shape* — where each fact is allowed to live so copies can't drift. Constraints ([primary keys](what-is-a-primary-key.md), [unique](what-is-a-unique-key.md), [foreign keys](what-is-a-foreign-key.md), CHECKs) control *values* — that references resolve, emails don't collide, quantities stay positive. Rule: a perfectly normalized schema still needs constraints, and constraints can't save a badly shaped one; you need both.

## 8. 🧠 The Memory Hook

"The key, the whole key, and nothing but the key — so help me Codd": 1NF gives every table *the key*, 2NF makes facts depend on *the whole key*, 3NF allows *nothing but the key*. And underneath it all, the one-line purpose: one fact, one place — because every copy of a fact is a future contradiction.
