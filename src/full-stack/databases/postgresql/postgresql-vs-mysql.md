# PostgreSQL vs MySQL

## 1. The Real-World Problem — When You Actually Hit This

It's Monday. Kickoff meeting for a brand-new service — let's say an inventory system with messy product attributes, reporting dashboards, and a hard launch date. Someone asks the innocent question: "So, Postgres or MySQL?" And suddenly half the room is talking at once.

One engineer says "MySQL, we've run it for ten years, our hosting is dirt cheap, everyone knows how to operate it." Another says "Postgres, obviously — JSONB, transactional migrations, better SQL." The tech lead says "they're both databases, just pick one" and moves on to the next agenda item. Now the decision is yours, and it sticks: six months after launch, when you have hundreds of gigabytes and daily traffic, swapping engines is a painful migration project, not a config change.

This question shows up in interviews for the same reason it shows up in that meeting. Interviewers don't want "Postgres is more advanced, MySQL is faster" — they want to know whether you understand what actually differs under the hood, and whether you can connect those differences to your specific workload. Get this right and you sound like someone who's made the call before. Get it wrong with clichés from 2015 and the interview quietly loses confidence in you.

## 2. The Analogy — Make the Mechanic Obvious

Think of two kitchens serving the same city.

**PostgreSQL is a fine-dining kitchen.** When a guest walks in, the head chef assigns that guest their own personal chef — a whole person, with their own station, their own knives, their own workspace. Nothing one chef does can spill onto another chef's station. It's a fantastic experience, but hiring a chef takes time and money, so this kitchen can't seat five thousand walk-ins at once — it puts a maître d' at the door who groups guests together and feeds each seated party to a chef efficiently.

**MySQL is a high-volume diner.** There's one big kitchen, and every new order just gets handed to another cook who works at the shared counters. Adding capacity for one more order costs almost nothing — no new station, just another pair of hands in the same room. The diner takes walk-ins all day without a formal maître d'.

Same industry, opposite philosophy — and every headline difference between the two databases follows from it:

- **Special requests:** the fine-dining kitchen says "we don't do substitutions" and refuses the order rather than guess (Postgres throws an error on bad data). The diner says "no problem, we'll make it work" and quietly swaps ingredients (MySQL historically coerced and carried on).
- **Menu changes:** the fine-dining kitchen rehearses the new menu during a closed trial service — if the dish fails, nothing was ever served to a customer (Postgres DDL is transactional, you can roll back). The diner pins the new menu to the wall mid-service — customers see it instantly, and there's no unpinning it (MySQL DDL commits implicitly, no going back).
- **Old plates:** when the fine-dining chef corrects a dish, the old plate sits on the pass until the cleaning crew clears it (old row versions pile up in the table until VACUUM removes them). The diner cook writes corrections into one shared order-diary that the shift manager periodically shreds old pages from (InnoDB keeps old versions in undo logs that purge threads trim).

Hold that kitchen in your head. Every technical section below is just naming parts of it.

## 3. The Full Explanation — How It Actually Works

Both are mature, free, ACID-compliant relational databases. Postgres grew out of a Berkeley research project and leans "correct and expressive"; MySQL came out of Sweden in the mid-90s as the LAMP-stack workhorse and leans "fast and simple to run." Neither label is an insult — they're just different bets. Here's where the bets diverge, piece by piece.

**Connections: process per client vs thread per client.** When your app opens a connection, PostgreSQL forks an entire operating system process for it. That process has its own memory — realistically a few megabytes before your queries even allocate working memory — and if it crashes, the others keep running. MySQL keeps one server process and spawns a lightweight thread per connection instead, all sharing the same memory space. Threads cost a fraction of what processes cost, so a bare MySQL box tolerates thousands of idle connections more comfortably than a bare Postgres box. This is exactly why almost every serious Postgres deployment runs PgBouncer (or a cloud equivalent) in front of the database — a tiny pooler that holds a few dozen real connections and multiplexes thousands of app connections through them. Without it, a traffic spike or a leaky deploy gives you the infamous `FATAL: sorry, too many clients already`. MySQL feels the same pain later and less sharply (`Too many connections`), so pooling there is good practice rather than survival gear.

**MVCC: same idea, opposite bookkeeping.** Both databases let readers and writers work at the same time without blocking each other — that's MVCC, multi-version concurrency control: instead of overwriting a row in place, the engine keeps multiple versions so a reader sees a stable snapshot while a writer creates the next version. The implementations couldn't be more different. Postgres writes the new version as a brand-new row physically inside your table, marks the old one as dead, and relies on the autovacuum background workers to come clean up dead rows later. That's why Postgres has VACUUM at all — and why a forgotten long-running transaction is dangerous there: vacuum cannot remove anything newer than the oldest snapshot anyone still needs, so dead rows accumulate, the table bloats, indexes fatten, and queries slow down even though nobody deleted anything. InnoDB goes the other way: it updates the row in place and writes the previous image into undo logs. Readers needing an older snapshot reconstruct it from the undo chain, and purge threads trim old undo once nobody needs it. No vacuum, less bloat — but the same long-transaction disease shows up as runaway undo growth and a climbing history-list length. Different symptom, same root cause: snapshots held open forever.

**Replication: byte-copying the log vs recording statements/rows.** Postgres replication rides on the WAL — the write-ahead log of low-level page changes. Streaming replication ships those raw records to standbys, producing byte-identical copies: great for high availability and failover, but a standby must run the same major Postgres version, and it inherits everything, wanted or not. Postgres 10 added logical replication, which decodes the WAL into actual row changes ("insert this row into that table") delivered through a publish/subscribe model — that's what you use for selective copying, cross-version upgrades, and feeding other systems, with the known gaps that DDL isn't replicated and sequences historically weren't either (recent versions started closing the sequence gap). MySQL replication rides on the binlog, which has three formats: statement-based logs the SQL text (compact, but anything non-deterministic like `NOW()` or `LIMIT` without `ORDER BY` can replay differently), row-based logs the actual changed rows (default since MySQL 5.7 — bigger, safer, the sane choice), and mixed picks per statement. MySQL also had global transaction IDs (GTIDs) and semi-sync acknowledgment early and widely, which is part of why its replica tooling feels so battle-tested. One symmetry worth knowing: both engines reuse their logs for point-in-time recovery — archived WAL segments in Postgres, binlog replay in MySQL.

**SQL strictness: standards-first vs pragmatic-with-a-history.** Postgres enforces the SQL standard tightly and predictably: invalid input is an error, always, in every configuration. MySQL earned its lenient reputation honestly — before 5.7, an empty `sql_mode` meant invalid dates became zeros, oversized strings silently truncated, and `GROUP BY` happily let you select columns you didn't group by, picking an arbitrary row's value. Modern MySQL is a different animal: since 5.7, `ONLY_FULL_GROUP_BY` and `STRICT_TRANS_TABLES` are on by default, so sloppy `GROUP BY` and silent truncation now error out too. Two honest residues remain. First, MySQL still performs implicit type conversions: comparing a string column to a number coerces every value (and silently disables the index on that column — a real production killer, shown below). Second, both engines now allow selecting columns functionally determined by a grouped primary key, but MySQL's strictness is a switch you can flip off per session; Postgres's is not a switch at all. When an interviewer asks "which one is more standard-compliant," the honest answer is "Postgres, consistently — but the MySQL horror stories you memorized mostly describe 5.6-and-earlier settings."

**Data types and extensibility: Postgres's biggest home win.** Postgres ships JSONB — JSON parsed into a binary form you can index with GIN indexes and query with containment operators — plus real arrays, range types, network types, custom composite types, and an extension ecosystem that's basically unfair: PostGIS for geospatial (still years ahead of anything MySQL offers), pg_stat_statements for query stats, pgvector for embeddings, TimescaleDB and Citus for scale-out. MySQL isn't stuck in 2010 anymore: it has a native JSON type since 5.7 with a solid function library, window functions and CTEs since 8.0, enforced CHECK constraints since 8.0.16, functional indexes since 8.0.13, and multi-valued indexes over JSON arrays since 8.0.17. What it genuinely lacks is the breadth: no array columns, no materialized views, no partial indexes, and effectively no extension ecosystem — if the engine doesn't do it, you build it yourself in application code or cron jobs.

**Migrations and DDL: the operational gut-punch difference.** In Postgres, DDL is transactional. You can wrap `CREATE TABLE`, `ALTER TABLE`, even `DROP TABLE` in a transaction and roll the whole thing back — a botched migration in staging teaches you the mistake instead of teaching your users. Caveat: transactional doesn't mean lock-free; most `ALTER TABLE` forms still take the heaviest lock in the system, so the real discipline is setting `lock_timeout` so your migration fails fast instead of freezing the app behind it. MySQL DDL issues an implicit commit — the change lands immediately and cannot be rolled back, which is the whole reason the ecosystem built gh-ost and pt-online-schema-change tools that fake online migrations by copying tables. MySQL 8.0 softened this meaningfully (an `ADD COLUMN` can run as an INSTANT, metadata-only operation), but the mental rule stands: in MySQL-land you plan schema changes like deployments; in Postgres-land you rehearse them like code.

**Operations, defaults, and the boring stuff that decides incidents.** MySQL's tuning story is famously shallow: size `innodb_buffer_pool_size`, keep an eye on the slow query log, done — one reason hosting companies love it. Postgres has more meaningful dials (`shared_buffers`, and the sneaky `work_mem`, which is allocated *per sort/hash operation*, not per connection — twenty concurrent sorts can multiply one innocent-looking value). Collation culture differs in ways that bite real apps: MySQL's default collations compare case-insensitively (`'Bob@x.com' = 'bob@x.com'` is true), Postgres comparisons are case-sensitive unless you reach for `ILIKE`, `LOWER()`, or the `citext` extension — duplicate-email bugs are born exactly here. On authentication defaults, modern versions of both finally ship sane password schemes (scram-sha-256 in Postgres 14+, caching_sha2_password in MySQL 8+). Observability: `pg_stat_statements` vs MySQL's `performance_schema` and slow query log — both excellent, neither on by default in a useful shape. Licensing footnote: Postgres is permissive BSD-style; MySQL is GPL with Oracle dual-licensing, which is why MariaDB (a community fork) exists.

**And the performance question, answered honestly.** "Which is faster?" is a workload question, not a fact. For millions of simple primary-key lookups, MySQL's thinner threading historically gave it an edge, and it remains superb at exactly that shape. For complex joins, aggregations, window-heavy analytics, and anything where the planner gets clever, Postgres's optimizer (parallel queries, strong hash joins) usually wins. At the scale most services actually run, both are faster than your application code, your network hops, and your missing index — measure with your own data (`EXPLAIN ANALYZE` exists in both; MySQL got it in 8.0.18) instead of inheriting someone's 2014 benchmark.

## 4. See It In Practice — Real Code or Queries

**Example 1 — the same messy product catalog, modeled twice.** Product attributes arrive from suppliers as arbitrary JSON, and products carry flexible tags. Watch how each engine absorbs the mess.

```sql
-- PostgreSQL: native arrays and indexable JSONB
CREATE TABLE products (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       text NOT NULL,
  price      numeric(10,2) NOT NULL CHECK (price >= 0),  -- CHECK enforced since forever
  tags       text[] NOT NULL DEFAULT '{}',               -- real array column
  attributes jsonb NOT NULL DEFAULT '{}',                -- parsed binary JSON
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GIN indexes make containment queries fast over the whole document/array
CREATE INDEX idx_products_tags ON products USING gin (tags);
CREATE INDEX idx_products_attrs ON products USING gin (attributes);

-- Find red products priced under 100: hits the GIN index, no table scan
SELECT name, price
FROM products
WHERE attributes @> '{"color": "red"}'
  AND price < 100;

-- Tag membership is a first-class query too
SELECT name FROM products WHERE 'sale' = ANY (tags);
```

```sql
-- MySQL 8.0: JSON type exists, but indexing needs explicit plumbing
CREATE TABLE products (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(255) NOT NULL,
  price      DECIMAL(10,2) NOT NULL CHECK (price >= 0),  -- enforced only since 8.0.16
  attributes JSON NOT NULL,
  created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
);

-- Option A: extract into a functional index (8.0.13+) — you must know the path up front
CREATE INDEX idx_products_color ON products ((CAST(attributes->'$.color' AS CHAR(32))));
SELECT name, price FROM products
WHERE attributes->>'$.color' = 'red' AND price < 100;

-- Option B: index a JSON array wholesale (8.0.17+ multi-valued index)
CREATE INDEX idx_products_labels ON products ((CAST(attributes->'$.labels' AS CHAR(32) ARRAY)));
SELECT name FROM products WHERE 'sale' MEMBER OF (attributes->'$.labels');
```

Same feature set on paper, different ergonomics in practice: Postgres indexes the whole document blindly and answers any containment query; MySQL asks you to declare which paths you'll search — perfectly fine when they're stable, annoying when suppliers keep inventing fields.

**Example 2 — strictness you can feel.** Run these in a psql and mysql shell side by side and the personalities appear immediately.

```sql
-- Implicit type conversion: the classic divergence
SELECT 'abc' = 0;        -- MySQL: returns 1 (string coerces to 0, with a warning)
                         -- PostgreSQL: ERROR — invalid input syntax for type... never guesses

-- The production killer: phone is VARCHAR, someone passes an unquoted number
SELECT * FROM users WHERE phone = 9155123400;
-- PostgreSQL: ERROR — operator does not exist: character varying = integer (loud, immediately)
-- MySQL: runs! Coerces EVERY phone value to a number per row, ignores the index,
--        and full-scans a million-row table. Silent, slow, maddening to debug.

-- Case sensitivity of comparisons
SELECT * FROM users WHERE email = 'Bob@Example.com';
-- MySQL (default *_ci collation): matches bob@example.com too
-- PostgreSQL: matches only the exact case — use ILIKE or LOWER(email) for fuzzy matching

-- GROUP BY: the history lesson
SELECT status, customer_id, COUNT(*) FROM orders GROUP BY status;
-- Pre-5.7 MySQL: ran fine, returned an arbitrary customer_id per group
-- MySQL 5.7+ (ONLY_FULL_GROUP_BY default): ERROR — same as Postgres
-- But grouping by the primary key unlocks other columns in BOTH engines:
SELECT o.id, o.status, o.total FROM orders o GROUP BY o.id;  -- valid in both: id is the PK
```

That unquoted-phone-number bug deserves a second look — it's the single most common "MySQL got mysteriously slow" story in real codebases, and the fix is embarrassingly boring: always quote string literals, or upgrade the column type.

**Example 3 — the failed migration experiment.** Try this deliberately, once, in staging of each database. It's the fastest way to internalize the DDL difference.

```sql
-- PostgreSQL: rehearse the destructive change safely
BEGIN;
DROP TABLE audit_log;              -- imagine you meant audit_log_2024
-- realize the mistake...
ROLLBACK;
SELECT count(*) FROM audit_log;    -- still there. Nothing happened. Breathe.

-- MySQL: the same experiment
START TRANSACTION;
ALTER TABLE users ADD COLUMN nickname VARCHAR(50);  -- implicit commit fires HERE
ROLLBACK;                                           -- rolls back... nothing
SHOW COLUMNS FROM users LIKE 'nickname';            -- the column is still there
```

In Postgres the migration tool wraps everything in a transaction and mistakes become rollbacks. In MySQL the mistake becomes permanent the moment the DDL runs — which is why mature MySQL shops treat every schema change like a mini-deployment: reviewed, rehearsed against a production-sized copy, executed with gh-ost or pt-online-schema-change for big tables, with a tested back-out plan.

## 5. Interview Questions — All of Them, Done Properly

**Q: How would you choose between PostgreSQL and MySQL for a new service?**

I'd start from the workload, not the brands. If the domain is complex and evolving — rich nested attributes, reporting, geospatial, search-adjacent features, anything where I'd benefit from JSONB with GIN indexes, arrays, range types, or extensions like PostGIS — Postgres buys me expression power and transactional DDL that makes iteration safer. If the workload is a massive fleet of simple read-heavy access patterns, my organization already operates MySQL at scale, or we're living in a hosting ecosystem built around it, MySQL's operational simplicity and thin connection model are genuinely valuable — modern MySQL 8.0 covers JSON, CTEs, and window functions, so the old capability gap is narrower than people repeat. Then I'd check the team dimension honestly: the database you can operate well beats the one that benchmarks better. Finally I'd note reversibility — both support logical-change replication you can migrate through, but nobody enjoys it, so I'd decide before data accumulates, not after.

**Q: How does MVCC differ internally between the two?**

Both give readers a stable snapshot without blocking writers, but they store history oppositely. Postgres keeps old row versions in the table itself: an UPDATE writes a new physical tuple and leaves the old one as a dead tuple that autovacuum must reclaim. Consequence: update-heavy tables bloat if vacuum falls behind, and any long-open transaction pins the oldest snapshot and stops cleanup globally. InnoDB keeps the current row in place and chains prior images in undo logs; consistent reads rebuild old versions from that chain and purge threads discard it once obsolete. Consequence: no vacuum, but the same long transaction now shows up as exploding undo and a growing history list. Same disease, different organs — and the follow-up question "why does Postgres need VACUUM?" is really this answer restated.

**Q: Why doesn't MySQL need vacuuming like Postgres?**

Because InnoDB never leaves garbage in the main table. The updated row replaces the old version directly, and the old version lives in undo storage, which purge threads shrink continuously. Postgres's design writes new versions alongside old ones in the heap for speed and simplicity of crash recovery, and defers cleanup — that deferred cleanup IS vacuum. Neither design is free: Postgres pays with autovacuum tuning and wraparound vigilance, InnoDB pays with undo management and purge lag monitoring.

**Q: Explain the difference in connection handling. Why is PgBouncer near-mandatory for Postgres?**

Postgres forks a full OS process per connection — own memory, own file descriptors, a few megabytes each before any query runs — so thousands of direct connections exhaust RAM and scheduler patience long before doing useful work. MySQL uses a thread per connection sharing one address space, which is orders of magnitude cheaper per idle connection. PgBouncer sits in front of Postgres holding a small pool of real connections and muxing thousands of app connections through them, typically in transaction mode. The classic caveat — prepared statements break in transaction pooling — has been fixed since PgBouncer 1.21, so the old objection is dated. MySQL benefits from pooling too at extreme scale, but skipping it won't take the site down on a normal Tuesday.

**Q: How does replication differ between them?**

Postgres has two lanes. Physical (streaming) replication ships raw WAL page-changes, making byte-identical standbys — ideal for HA/failover, restricted to the same major version, all-or-nothing. Logical replication (PG10+) decodes WAL into row events with publish/subscribe semantics — selective tables, cross-version upgrades — but skips DDL and, before recent releases, sequences. MySQL replicates via the binlog in three formats: statement (compact, dangerous with nondeterministic SQL), row (default since 5.7, deterministic, my default recommendation), and mixed; GTIDs make replica positioning sane and semi-sync adds acknowledgment. Practical summary: Postgres gives you a perfect hot clone plus a flexible second lane; MySQL gives you the most operationally familiar replication machinery on the planet.

**Q: Is MySQL's JSON "good enough" compared to Postgres JSONB?**

It's much closer than the internet says — MySQL has had a native JSON type since 5.7 and since 8.0 you can index extracted paths functionally (8.0.13) or index entire JSON arrays with multi-valued indexes (8.0.17). Where Postgres still pulls ahead: JSONB's GIN indexes serve arbitrary containment queries without declaring paths up front, the operator set is richer, and JSON composes with arrays, ranges, and the wider type system. Rule of thumb: stable, known paths queried at moderate volume — MySQL JSON is fine. Exploratory, path-diverse document data at volume — JSONB earns its keep.

**Q: Tell me about a migration failure and how each database would handle it.**

Classic scenario: a rename script drops the wrong table halfway through. In Postgres, wrapped in a transaction, the whole thing rolls back — DDL is transactional, the mistake costs minutes. In MySQL, each DDL statement issues an implicit commit, so the damage is permanent the instant it executes; recovery means restoring from backup or replaying binlog, costing hours. The senior nuance either way: transactional DDL is not a license for recklessness — most ALTERs still take Postgres's heaviest lock, so migrations should set `lock_timeout` and stay short. And in MySQL land, big-table changes go through gh-ost/pt-online-schema-change regardless, because even non-failing DDL can block traffic.

**Q: Which one is faster — give me a straight answer.**

Straight answer: it depends on query shape, and at realistic scales the database is rarely the bottleneck. Simple, high-volume point lookups favor MySQL's lean threading historically. Complex joins, aggregates, window analytics, and planner-sensitive queries favor Postgres. Any absolute claim without a workload is marketing. In interviews I say: "both saturate before most apps do — profile with EXPLAIN ANALYZE on your data, and check whether your N+1s or your missing indexes beat either engine to the punch." That answer signals more maturity than picking a winner ever will.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Rejecting MySQL because "it can't do JSON."** The wrong assumption: MySQL is stuck pre-2015. Reality: native JSON since 5.7, window functions and CTEs since 8.0, indexable JSON paths and arrays since 8.0.13/8.0.17. What happens if you carry this belief into an interview: you recite a stale cliché and the interviewer — who has shipped MySQL 8 — quietly marks you as someone who repeats lore instead of checking versions. The fix: know what modern MySQL covers AND where Postgres still leads (arbitrary-path GIN indexing, arrays, materialized views, extensions), then argue from your workload.

**Trap 2: Comparing string columns to numbers in MySQL.** The wrong assumption: `WHERE phone = 9155123400` behaves like the quoted version. Reality: MySQL coerces every phone string to a number per row, which both produces nonsense matches and disables the index — a full scan on a table that has a perfectly good index on `phone`. Postgres rejects the query outright with an operator error, which is why Postgres developers never learn this reflex. Fix: quote every string literal, enforce column types in the ORM layer, and put a query lint rule in CI — this class of bug survives code review because the query "works."

**Trap 3: Trusting Postgres's transactional DDL to make migrations safe.** The wrong assumption: "my migration is in a transaction, therefore it's harmless." Reality: transactional means *reversible*, not *non-blocking* — most `ALTER TABLE`s grab an `ACCESS EXCLUSIVE` lock, and if that ALTER queues behind a long-running query, every subsequent query on the table queues behind the ALTER. Your two-second migration becomes a site-wide outage with a rollback that never helped anyone. Fix: `SET lock_timeout = '5s'` before migrating so the ALTER gives up instead of stacking traffic, keep transactions short, and run long rebuilds as create-new-table-and-swap patterns.

**Trap 4: The long-running transaction that nobody remembers opening.** The wrong assumption: leaving a transaction open (a stuck console session, a paused debugger, a batch job that forgot to commit) is harmless idle time. Reality: in Postgres, that snapshot freezes the oldest-xmin horizon, autovacuum can't clean anything newer, dead tuples and index bloat accumulate table-wide, and in the extreme the engine starts screaming about transaction ID wraparound. In InnoDB, the same session grows the undo history, purge stalls, and reads that must rebuild old versions get slower. Fix: alert on `pg_stat_activity` idle-in-transaction time and on InnoDB history-list length; cap `idle_in_transaction_session_timeout`; audit batch jobs for missing commits.

**Trap 5: Running Postgres without a pooler because "MySQL never needed one."** The wrong assumption: connection handling is identical, so yesterday's MySQL habit — one connection per request, or per background worker — transfers. Reality: Postgres processes are heavyweight; a deploy spike or a leaked handle produces `too many clients already` at a few hundred connections on default settings. Fix: PgBouncer (transaction pooling) or a cloud-native pooler in front of Postgres from day one, sized to real concurrency, with the app treating connections as borrowed, not owned.

**Trap 6: Upgrading a legacy MySQL app and watching GROUP BY break.** The wrong assumption runs backwards from Trap 1: teams assume old lenient behavior persists across upgrades. Reality: MySQL 5.7 turned on `ONLY_FULL_GROUP_BY` by default, so queries that selected non-aggregated columns and "worked" (returning arbitrary values!) start throwing on the upgraded server — often discovered in production, not staging, because that one report query only ran monthly. Fix: test every query path against the new server before upgrading, rewrite offenders with proper aggregation or `ANY_VALUE()` where arbitrariness was intentional, and resist disabling the mode — it was hiding real bugs.

## 7. Compare With Related Concepts

People confuse this decision with several neighboring ones. The distinctions, each with a one-line rule:

- **PostgreSQL vs MongoDB:** Mongo stores self-contained documents of varying shape and trades join power for layout flexibility; Postgres's JSONB covers document-ish needs inside relational guarantees. Rule: if your data is genuinely one blob per entity with rare cross-entity queries, consider MongoDB; if entities relate to each other constantly, relational wins — and JSONB often removes the last excuse to leave.
- **PostgreSQL vs MariaDB:** MariaDB is the community fork of MySQL created after Oracle's acquisition, keeping the same operational philosophy with its own diverging features. Rule: choose MariaDB when escaping Oracle licensing/governance matters; treat them as siblings, not alternatives to Postgres.
- **Postgres vs MySQL for a specific feature — replication:** Postgres physical replicas are perfect clones but rigid; MySQL binlog replication is flexible and operationally familiar but demands format discipline. Rule: HA clone → Postgres streaming; heterogeneous fan-out and familiar ops → MySQL binlog (or Postgres logical when cross-version).
- **SQLite:** embedded, zero-admin, single-writer — and unbeatable in its lane. Rule: mobile apps, local dev, small single-box services → SQLite before either giant.
- **Deep dives this page leaned on:** MVCC internals ([Postgres MVCC](./what-is-mvcc.md)), the cleanup crew ([VACUUM](./what-is-vacuum.md)), the document story ([JSON vs JSONB](./json-vs-jsonb.md), [storing JSON in MySQL](../mysql/how-do-you-store-json-in-mysql.md)), replication mechanics ([streaming](./what-is-streaming-replication.md), [logical](./what-is-logical-replication.md), [binlog](../mysql/what-is-binlog.md), [MySQL replication](../mysql/what-is-mysql-replication.md)), the InnoDB engine itself ([InnoDB](../mysql/what-is-innodb.md)), and connection strategy ([PgBouncer](./what-is-connection-pooling-with-pgbouncer.md)). Background primers: [What is PostgreSQL](./what-is-postgresql.md) and [What is MySQL](../mysql/what-is-mysql.md).

The final decision rules, compressed: new product with complex, evolving data and reporting needs → Postgres. Enormous fleets of simple read-heavy access patterns, deep existing MySQL operations expertise, or hosting ecosystems that assume it → MySQL. Undecided with a greenfield team and no special constraints → Postgres has become the sensible default in 2026 — not because MySQL is weak, but because its extension-rich, migration-friendly surface keeps paying rent as requirements drift.

## 8. 🧠 The Memory Hook

Postgres is the fine-dining kitchen — a personal chef per table (process per connection), a strict no-substitutions policy (errors, not guesses), rehearsal menus you can cancel (transactional DDL), and a cleaning crew because corrected dishes pile up (VACUUM). MySQL is the high-volume diner — cheap seats in a shared kitchen (thread per connection), "we'll make it work" flexibility, menus pinned mid-service (implicit-commit DDL), and corrections kept in a diary the manager shreds (undo logs + purge). Pick the diner for simple orders at massive volume; pick the tasting menu when the orders get complicated — and remember: whichever kitchen you choose, an order ticket left open overnight ruins everyone's night.
