# What is SQL

## 1. The Real-World Problem — When You Actually Hit This

Your orders endpoint has been getting slower for weeks. You profile it and find the code looping through customers in JavaScript, running one database query per customer to count their orders. Five hundred customers means five hundred separate round trips to the database, each one paying network latency and index lookup cost, all serialized one after another. Your senior rewrites the whole loop into one twelve-line SQL statement and it finishes almost instantly. Nothing changed on the hardware. What changed is that you were treating the database like a dumb row-fetcher, and SQL let the database do what it's actually built for: working on entire sets of rows in one shot.

Then the interview starts with the question everyone thinks is easy: "So, what is SQL?" Most candidates answer "Structured Query Language — it stores data in tables" and stop there. That answer marks you as a junior, because it misses everything that matters: SQL is *declarative*, it's really four small sublanguages wearing one name, it has survived every technology that promised to kill it, and the "one SQL" you learned is actually a family of dialects that will quietly break your app when you deploy to a different engine than you tested on. This page is about all of that.

## 2. The Analogy — Make the Mechanic Obvious

Think of a restaurant with a printed menu.

The **menu is the schema**. It lists exactly which dishes exist and what goes into them. You can't order "a sandwich with the database schema swapped for extra cheese" — off-menu requests get rejected. When you write `CREATE TABLE`, you're printing the menu. When you ask for a column that doesn't exist, the waiter says "that's not on the menu."

**Ordering food is writing a query.** You say *"two margheritas and one Caesar salad"* — a description of the result you want. You do not tell the kitchen which pan to use, which burner to light first, or in what order to grate the cheese. You state WHAT. The kitchen figures out HOW. That is the single most important property of SQL, and everything else on this page grows out of it.

The **head chef is the query planner**. Your order arrives at the kitchen and someone decides how to execute it: which cook takes which dish, what runs in parallel, what waits. The plan depends on how busy the kitchen is and what equipment is free. A database does the same thing — it looks at your statement plus its own internal statistics and indexes, and picks an execution strategy. The same sentence can produce a different plan tonight than it did at lunch.

Here's the part that surprises people: when the restaurant buys a faster oven, your order doesn't change one word, but your food arrives sooner. Add an index to a table and the exact same query gets faster with zero changes to your code. Performance tuning in SQL lives *below* the language, which is only possible because the language never described the mechanics in the first place.

The **table's ticket is a transaction**. The kitchen fires all your meals as one ticket. If the third dish comes out ruined, they don't serve three meals and shrug — they remake or cancel the ticket as a unit. `BEGIN`, `COMMIT`, and `ROLLBACK` are exactly this: a group of changes that either all land or none do.

And every city's branch of the chain speaks the same menu language with different specials — that's your dialect problem, and we'll get there.

## 3. The Full Explanation — How It Actually Works

In plain words: SQL is the language you use to talk to a relational database — a database that stores data in tables of rows and columns, where tables can reference each other through keys. (That storage model is covered properly in [what-is-rdbms.md](what-is-rdbms.md); this page is about the *language*.) You write statements that describe results or changes, and the database engine — the actual program running, whether that's PostgreSQL, MySQL, or SQLite — works out the steps.

**It's declarative: say WHAT, never HOW.** Most code you've written is imperative: loop over customers, initialize a counter, increment it, append to a list. SQL is the opposite. Compare:

```js
// Imperative: YOU decide every step
let total = 0;
for (const o of orders) {
  if (o.status === 'paid') total += o.total_cents;
}
```

```sql
-- Declarative: YOU describe the result
SELECT SUM(total_cents) FROM orders WHERE status = 'paid';
```

The second version doesn't say whether to scan the table, use an index, or aggregate while scanning. The engine's planner decides, based on table sizes and statistics. This has real consequences you'll be asked about:

- Your job shifts from "implement the algorithm" to "describe the right result well," because a badly phrased query can still be *correct* but force a terrible plan.
- Indexes change performance without touching code, because the planner exploits whatever access paths exist. (How that works is the topic of [how-does-an-index-improve-query-performance.md](how-does-an-index-improve-query-performance.md).)
- The same query text can take different execution plans as data grows — which is why "it was fast in dev" proves nothing. Reading those plans is what [what-is-explain.md](what-is-explain.md) teaches.

There's a second surprise hiding in declarative style: **the order you write clauses is not the order the engine evaluates them.** You write:

```sql
SELECT name, SUM(total_cents)          -- 5th
FROM customers                         -- 1st
JOIN orders ON orders.customer_id = customers.id  -- 2nd
WHERE status = 'paid'                  -- 3rd
GROUP BY name                          -- 4th
HAVING SUM(total_cents) > 10000        -- 6th
ORDER BY SUM(total_cents) DESC         -- 7th
LIMIT 10;                              -- 8th
```

but logically the engine works FROM first, then JOIN, WHERE, GROUP BY, HAVING, and only then SELECT, ORDER BY, LIMIT. This one fact explains two classic interview questions: why `WHERE` can't filter on aggregates (aggregation hasn't happened yet — that's `HAVING`'s job), and why a `SELECT` alias usually can't appear in `WHERE` (the SELECT list hasn't been evaluated yet).

**Four sublanguages in one trench coat.** "SQL" is really four small vocabularies, and interviews love asking you to sort verbs into them:

- **DDL — Data Definition Language:** defines structure. `CREATE TABLE`, `ALTER TABLE`, `DROP TABLE`. Changing the menu, not the food. In production these ship as migrations through CI, because changing structure mid-traffic needs care ([what-is-schema-migration.md](what-is-schema-migration.md)).
- **DML — Data Manipulation Language:** changes the data inside that structure. `INSERT`, `UPDATE`, `DELETE`.
- **DQL — Data Query Language:** reads data. Honestly it's just `SELECT`, but it's the verb you'll write 95% of the time, so it earns its own category.
- **TCL — Transaction Control Language:** groups work into all-or-nothing units. `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT` — the ticket mechanism from our analogy, explained fully in [what-is-a-transaction.md](what-is-a-transaction.md).

(There's a fifth minor family, DCL — `GRANT`/`REVOKE` for permissions — worth knowing by name.)

The split isn't academic trivia. It shows up in real operations: you give the analytics intern's user SELECT-only grants so they physically cannot delete anything; your deployment pipeline runs DDL migrations but application code mostly issues DML and DQL; and any multi-step DML that must succeed or fail together gets wrapped in TCL. Naming which family a statement belongs to tells a senior interviewer you understand *what kind of risk* each statement carries.

**Why SQL outlived everything sent to kill it.** SQL came out of IBM research in the 1970s (originally named SEQUEL), built on Edgar Codd's 1970 relational model, and was standardized by ANSI in 1986. Since then it has been declared dead roughly once a decade — and every obituary was wrong.

The big assault was the NoSQL wave of the late 2000s and 2010s. MongoDB, Cassandra, and friends attacked a real weakness: relational databases of that era struggled to scale writes across many machines. But notice what happened next. Wherever people needed to *ask questions of data*, they reinvented SQL. Cassandra got CQL — a query language deliberately shaped like SQL. Couchbase built N1QL, "SQL for JSON." Amazon created PartiQL, SQL-compatible queries over semi-structured data. The entire analytics industry — Snowflake, BigQuery, Redshift, Spark SQL, dbt — is SQL-first. Even MongoDB's aggregation stages (`$match`, `$group`) mirror `WHERE` and `GROUP BY` clause-for-clause. Meanwhile Google Spanner, CockroachDB, and TiDB solved the horizontal-scaling problem itself and kept SQL as the interface anyway.

Why did the language win? Three durable reasons:

1. **Declarativity scales human effort.** Because SQL describes results instead of procedures, the math underneath it (relational algebra) lets an optimizer safely rewrite your query into a better one — reorder joins, push filters down. Every new storage innovation automatically speeds up existing queries, no rewrite needed.
2. **Transactions are non-negotiable where correctness matters.** Money, inventory, reservations — anywhere two writers race, ACID guarantees beat eventual consistency, and SQL databases deliver them natively.
3. **Network effects compounded.** Fifty years of tooling, reporting software, ORMs, and trained engineers speak it. A query language is a protocol, and protocols get more valuable as more things adopt them.

The lesson for interviews: SQL is best understood as an *interface* that outlived specific implementations. Storage engines come and go; the way humans ask databases for data converged on one grammar.

**The uncomfortable truth: "standard SQL" barely exists.** There IS an ISO standard (most recently SQL:2023), but no major engine implements just the standard — every vendor adds extensions and leaves gaps. Consequences you will personally hit:

**Same intent, different syntax.** The upsert — insert a row, or update it if the key already exists — is spelled three ways:

```sql
-- PostgreSQL, and modern SQLite:
INSERT INTO product_stock (sku, qty) VALUES ('ABC', 10)
ON CONFLICT (sku) DO UPDATE SET qty = qty + excluded.qty;

-- MySQL (VALUES() deprecated in 8.0.20+, row aliases preferred now):
INSERT INTO product_stock (sku, qty) VALUES ('ABC', 10)
ON DUPLICATE KEY UPDATE qty = qty + VALUES(qty);
```

**Features simply missing somewhere.** `INSERT ... RETURNING id` — hand the caller back the new row's key in one round trip — works in PostgreSQL and recent SQLite. MySQL doesn't have it; you fall back to `LAST_INSERT_ID()`. Auto-incrementing primary keys differ too: SQLite wants `INTEGER PRIMARY KEY AUTOINCREMENT`, PostgreSQL prefers `GENERATED ALWAYS AS IDENTITY`, MySQL uses `AUTO_INCREMENT`.

**Silent behavior differences are worse than syntax errors.** Identifier quoting differs (PostgreSQL `"quoted_ident"`, MySQL backticks, SQLite accepts both). String comparison case-sensitivity depends on collation — `'Asha' = 'asha'` is false under PostgreSQL defaults, often true under common MySQL collations, and `LIKE` in SQLite ignores case for ASCII. Grouping rules differ: PostgreSQL rejects selecting a non-grouped, non-aggregated column; SQLite and pre-5.7 MySQL silently return a value from an arbitrary matching row.

This matters concretely: teams develop on SQLite "because it's easy" and deploy to PostgreSQL, then discover their lenient queries error out and their SQLite-only syntax won't parse. ORMs paper over some of this by generating dialect-specific SQL, but the moment you write raw SQL — and eventually you will, for reports and performance work — you're writing for one specific engine. Know which one, and test against it.

**What SQL costs you.** Honesty about trade-offs belongs in a senior answer. SQL's declarative power creates an *impedance mismatch*: your app thinks in objects and loops, the database thinks in sets, and ORMs exist to translate between them — introducing their own leakiness and N+1 risks. Its text-based nature makes string-concatenated queries a security hazard (see Traps below). And leaning on vendor extensions buys convenience today at the price of migration pain tomorrow.

## 4. See It In Practice — Real Code or Queries

Everything in the first block runs as-is on any engine including SQLite (`sqlite3 :memory:`). Dialect-specific blocks are labeled.

**One statement replacing the 500-round-trip loop.** Total paid spend per customer, including customers with zero orders:

```sql
CREATE TABLE customers (
  id    INTEGER PRIMARY KEY,
  name  TEXT NOT NULL,
  city  TEXT NOT NULL
);

CREATE TABLE orders (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  total_cents  INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending'
);

INSERT INTO customers (id, name, city)
VALUES (1, 'Asha', 'Pune'), (2, 'Ben', 'Berlin'), (3, 'Chen', 'Osaka');

INSERT INTO orders (customer_id, total_cents, status) VALUES
  (1, 2500, 'paid'),
  (1, 1800, 'paid'),
  (2, 9900, 'paid'),
  (2, 1500, 'refunded'),
  (3, 700,  'pending');

SELECT c.name,
       COUNT(o.id)                      AS paid_orders,
       COALESCE(SUM(o.total_cents), 0)  AS lifetime_cents  -- LEFT JOIN leaves NULLs; show 0 instead
FROM customers c
LEFT JOIN orders o
       ON o.customer_id = c.id AND o.status = 'paid'  -- filter in the JOIN, not WHERE,
                                                      -- or the LEFT JOIN would drop zero-order customers
GROUP BY c.id, c.name
ORDER BY lifetime_cents DESC;
```

Result:

```txt
Ben|1|9900
Asha|2|4300
Chen|0|0
```

Notice what you did NOT write: no loops, no temporary variables, no sorting algorithm. Chen appearing with zeros — instead of vanishing — is the `LEFT JOIN` doing set logic that would take careful conditional code in JavaScript. Note also that we group by `c.id, c.name`: grouping by the key and adding `name` keeps every selected column accounted for, which is legal in every engine.

**The four families in one flow** (a money transfer — the canonical transaction example):

```sql
-- DDL: define the shape once
CREATE TABLE accounts (
  id             INTEGER PRIMARY KEY,
  owner          TEXT NOT NULL,
  balance_cents  INTEGER NOT NULL CHECK (balance_cents >= 0)
);

-- DML wrapped in TCL: both updates land, or neither does.
-- Without the transaction, a crash between the two UPDATEs loses money.
BEGIN;
UPDATE accounts SET balance_cents = balance_cents - 5000 WHERE id = 1;
UPDATE accounts SET balance_cents = balance_cents + 5000 WHERE id = 2;
COMMIT;

-- DQL: read the settled state
SELECT owner, balance_cents FROM accounts ORDER BY owner;
```

Result after commit:

```txt
Asha|15000
Ben|10000
```

The `CHECK` constraint is worth pointing out in interviews: it moves a business rule ("balances never go negative") into the database itself, so even a buggy query outside your app can't violate it.

**Same intent, three dialects.** Returning the auto-generated id of an inserted row:

```sql
-- PostgreSQL:
INSERT INTO orders (customer_id, total_cents) VALUES (42, 2500)
RETURNING id;

-- SQLite (3.35+, 2021):
INSERT INTO orders (customer_id, total_cents) VALUES (42, 2500)
RETURNING id;

-- MySQL: no RETURNING — separate call, and only safe on the SAME connection:
INSERT INTO orders (customer_id, total_cents) VALUES (42, 2500);
SELECT LAST_INSERT_ID();
```

Three engines, one intention, three integration stories — this is why your data layer declares which dialect it targets, and why connection-per-request code that assumes `LAST_INSERT_ID()` survives across connections breaks subtly under pooling.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is SQL?**

SQL (Structured Query Language) is the standard language for working with relational databases — defining their structure, changing their data, and querying it. Two properties matter more than the acronym. First, it's declarative: you describe the result you want and the engine's planner chooses the execution steps, which is why indexes and table statistics affect performance without any change to your query text. Second, it's organized into sublanguage families: DDL for structure (`CREATE`/`ALTER`/`DROP TABLE`), DML for data changes (`INSERT`/`UPDATE`/`DELETE`), DQL for reads (`SELECT`), and TCL for transactions (`BEGIN`/`COMMIT`/`ROLLBACK`). It's been standardized since 1986, though every engine — PostgreSQL, MySQL, SQLite — speaks it with its own dialect, so in practice you always target a specific engine.

**Q: SQL is called "declarative." What does that actually mean and why should I care?**

It means your query states WHAT rows you want or WHAT change to make, not the procedure for doing it. In imperative code you'd loop, compare, and accumulate yourself. In SQL you write one statement and the planner — armed with table statistics and knowledge of available indexes — picks the access path, join order, and aggregation strategy. You care for three reasons. Performance becomes a shared responsibility: a correct query can still generate a disastrous plan, so you need to read `EXPLAIN` output, not just write valid SQL. Schema changes become performance changes: adding the right index speeds up untouched queries, because the planner finds new options. And the engine stays free to adapt plans as data volume grows — the same query can legitimately switch strategies between a thousand rows and a hundred million, which is exactly what you want.

**Q: Explain DDL, DML, DQL, and TCL with examples of when you'd use each.**

DDL defines structure: `CREATE TABLE orders (...)`, `ALTER TABLE orders ADD COLUMN shipped_at TIMESTAMP`. These ship through migration scripts in CI, because altering live tables under traffic is risky. DML modifies data: `INSERT INTO orders ...`, `UPDATE accounts SET balance_cents = balance_cents - 5000 WHERE id = 1`. DQL reads: `SELECT ... FROM orders WHERE ...`, the statement you write constantly and tune obsessively. TCL groups statements into atomic units: `BEGIN`, `COMMIT`, `ROLLBACK`, `SAVEPOINT`. In practice the split maps to permissions and process — analysts get SELECT-only grants so they cannot mutate anything; bulk DML jobs get wrapped in transactions so partial failure can't corrupt data; and knowing that `ALTER TABLE` is DDL tells you it may take a lock that blocks DML behind it during deployment.

**Q: You write SELECT first, so why can't WHERE use a SELECT alias?**

Because the engine doesn't evaluate clauses in written order. Logically it processes FROM and JOINs first, then WHERE filters individual rows, then GROUP BY collapses them, HAVING filters groups, and only then does the engine compute the SELECT list — followed by ORDER BY and LIMIT. Since WHERE runs before SELECT, the alias doesn't exist yet when WHERE executes. (HAVING and ORDER BY run after, which is why they CAN use aliases.) The fix is repeating the expression in WHERE, or computing it earlier in a subquery or CTE. One honest caveat that doubles as a dialect warning: SQLite accepts aliases in WHERE as a non-standard extension, so code developed against SQLite can fail with "column does not exist" the day it meets PostgreSQL. Standard behavior is what PostgreSQL does.

**Q: NoSQL was supposed to replace SQL. What happened?**

NoSQL attacked a real bottleneck — early relational databases scaled writes poorly across machines — and genuinely won certain workloads like document-shaped, loosely consistent data at web scale. But it never displaced SQL, for a few converging reasons. The relational model and its algebra let optimizers rewrite queries safely, so storage improvements sped up existing queries automatically; NoSQL APIs pushed query logic back into application code. ACID transactions turned out to be non-negotiable for money, inventory, and anything with concurrent writers. And the ecosystem gravity was enormous: BI tools, reporting stacks, ORMs, and every trained analyst spoke SQL. The telling evidence is that the challengers adopted the interface they'd mocked — Cassandra's CQL, Couchbase N1QL, AWS PartiQL, MongoDB's `$match`/`$group` mirroring `WHERE`/`GROUP BY` — while NewSQL systems like CockroachDB and Spanner fixed the scaling problem and kept SQL as the front door. The storage engine lost the argument; the language never did.

**Q: What's the difference between SQL and MySQL?**

Category error, extremely common. SQL is the language; MySQL is a database engine — a server program that implements that language (alongside PostgreSQL, SQLite, SQL Server, and Oracle). Asking "which is better, SQL or MySQL" is like asking whether English or a British person communicates better. The distinction has teeth in practice: your SQL skills transfer across engines, but each engine adds dialect — different upsert syntax, different functions, different locking behavior — so "we use SQL" is an incomplete sentence in system design. The complete version is "we use PostgreSQL 15" or "MySQL 8 with InnoDB," because isolation levels, index types, and replication behavior all live at the engine level, not the language level.

**Q: Give a concrete example of dialect differences causing a real bug.**

Classic scenario: the team develops locally on SQLite because it needs zero setup, deploys to PostgreSQL. Three failure modes show up. Syntax: an `ON DUPLICATE KEY UPDATE` written by someone with MySQL muscle memory doesn't parse in PostgreSQL, which wants `ON CONFLICT ... DO UPDATE`. Silent leniency: SQLite happily returns a column from an arbitrary row in a sloppy `GROUP BY` query; PostgreSQL rejects the same query outright, so a report crashes on day one in production. Semantics: a query relying on SQLite's case-insensitive `LIKE` behaves differently once string comparisons hit PostgreSQL's case-sensitive default collation. The fixes are boring but senior: declare the target dialect in your data layer, run integration tests against the real engine (a Postgres container in CI is cheap), and treat any "works locally, fails in prod" database bug as a dialect mismatch until proven otherwise.

**Q: Is SQL a programming language?**

It's a specialized, declarative data language rather than a general-purpose one. Standard SQL has no variables, no loops, no procedure definitions — by design, because stating results is its whole trick. That said, the boundaries are fuzzy in interesting ways you can mention for credit: recursive CTEs make SQL Turing-complete in theory, and every major vendor ships a procedural extension for stored logic — PL/pgSQL in PostgreSQL, T-SQL in SQL Server, PL/SQL in Oracle — which adds loops, conditionals, and variables for code that lives inside the database. The senior take: use SQL for set operations where it excels, reach for procedural extensions sparingly (they complicate scaling and testing), and implement general business logic in your application language.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: "SQL is SQL — my query runs on any database."** The wrong assumption is that the ISO standard guarantees portability. It doesn't, because every engine extends the standard and fills gaps its own way. What actually happens: your upsert uses `ON DUPLICATE KEY UPDATE`, staging runs PostgreSQL, and the migration fails on deploy — or worse, a lenient `GROUP BY` that SQLite tolerated starts erroring (or returning different rows) in production. The fix: pin your dialect explicitly in the ORM/driver config, run CI tests against the actual production engine in a container, and when you must support multiple engines, restrict yourself to the conservative intersection and isolate the divergent bits in one place.

**Trap 2: Treating the database like a row-fetching API.** The wrong assumption is that fetching rows and processing them in application code is equivalent to letting the database do it. It's not, because moving data over the network is the expensive part, and the database can filter, join, and aggregate internally using indexes without data ever leaving the machine. What actually happens: the N+1 pattern — one query per item — turns 500 cheap lookups into 500 serialized network round trips, or someone fetches two million rows to sum them in JavaScript and the API times out and the Node process balloons in memory. The fix: push filtering, joining, grouping, and aggregation into SQL and fetch result sets; reserve application-side processing for logic the database genuinely can't express.

**Trap 3: Assuming clauses run top to bottom.** The wrong assumption is reading order equals execution order. What actually happens: `WHERE` references a `SELECT` alias and throws "column does not exist"; a developer "fixes" filtering aggregated totals by putting them in `WHERE` and gets confusing empty results, because `WHERE` runs per-row before any aggregation exists — that's `HAVING`'s job. The fix: memorize the logical pipeline — FROM/JOIN, WHERE, GROUP BY, HAVING, SELECT, DISTINCT, ORDER BY, LIMIT — and reason about queries in that order. It instantly explains alias visibility, WHERE-vs-HAVING, and why you can use aliases in ORDER BY but not WHERE.

**Trap 4: Building queries by string concatenation.** The wrong assumption is that formatting user input directly into a query string is harmless convenience: `"SELECT * FROM users WHERE email = '" + email + "'"`. It's wrong because SQL draws no line between your code and concatenated text — injected text becomes executed SQL. What actually happens: a user submits `' OR '1'='1` as the email and receives every user in the table; with stacked or crafted queries they can exfiltrate or destroy data. This remains one of the most exploited vulnerability classes in existence. The fix: parameterized queries (prepared statements) everywhere, with values bound separately from the query text. Every driver and ORM supports them — including raw-query escapes in ORMs, which is exactly where people forget.

**Trap 5: Learning GROUP BY on a lenient engine.** The wrong assumption, absorbed silently from SQLite or old MySQL: you can select columns you neither grouped nor aggregated. Those engines return *some value* from an arbitrary matching row, so it looks like it works. What actually happens: your "customer's most recent email" query returns a random email per customer, the bug is invisible in testing, and it surfaces weeks later as corrupted-looking reports — or the same query hits PostgreSQL, which correctly rejects it. The fix: discipline over habit — every selected column is either aggregated (`COUNT`, `SUM`, `MAX`) or listed in `GROUP BY`; when you truly want "a row from each group," say so explicitly with window functions or a distinct-on construct rather than hoping the engine picks nicely.

## 7. Compare With Related Concepts

**SQL vs MySQL/PostgreSQL/SQLite.** Language versus engine: SQL is the grammar, the engines are speakers who each have an accent — different dialects, functions, and locking internals. Rule: learn SQL once, but always state and target the specific engine in design answers and configs.

**SQL vs NoSQL query languages (MongoDB's MQL, Cassandra CQL).** SQL asks questions over related *sets* with joins and ad-hoc predicates; most NoSQL APIs are shaped around accessing documents or keys by known patterns, trading flexible querying for predictable scale. Rule: model around relationships and varied ad-hoc questions, choose SQL; model around one known access pattern at huge write scale, a NoSQL API may fit.

**SQL vs an ORM (Prisma, SQLAlchemy, Hibernate).** An ORM translates objects to SQL for you — productivity win, but it's a leaky abstraction that sometimes emits terrible queries (N+1 being the classic) and hides which SQL actually runs. Rule: ORM for routine CRUD and migrations, drop down to handwritten SQL for complex reads and performance work — and always be able to say what SQL your ORM produces.

**Standard SQL vs PL/pgSQL / T-SQL / PL-SQL.** Standard SQL states results declaratively; the procedural extensions layer loops, variables, and control flow on top for stored procedures living inside the database. Rule: stay declarative by default; accept procedural code only when co-locating logic with the data clearly wins (and know you're buying testing and scaling complexity).

## 8. 🧠 The Memory Hook

SQL is ordering from a menu: you describe the meal you want, and the kitchen's head chef — the query planner — decides the pans, the burners, and the order of cooking. Four verb families run your entire career — define the menu (DDL), change the food (DML), ask for plates (DQL), fire or cancel the ticket (TCL) — and every restaurant in town speaks the same menu language with its own accent, so always name which kitchen you're cooking in.
