# What Is Indexing?

## 1. The Real-World Problem — When You Actually Hit This

Your login endpoint has been quietly getting slower for months. Nobody changed anything — the query is a humble `SELECT id, password_hash FROM users WHERE email = ?`, it ran in single-digit milliseconds during development, and it passed every test. But the users table crossed five million rows last quarter, and now p99 login latency is climbing past two seconds. During peak hours the database CPU sits pinned near 100%, the connection pool fills with waiting queries, and the slowness leaks into every endpoint that shares that pool — checkout, dashboards, everything.

You open the slow query log and find the truth: every single login attempt is reading **all five million rows** to find the one user whose email matches. The database isn't malfunctioning — it's doing exactly what it was told. You never gave it a faster way to find a user by email, so it checks every row, every time. This is the moment most engineers truly learn what indexing is: not a buzzword, but the difference between "look at everything" and "know exactly where to look."

And there's a second act to the story. Someone panics, reads "indexes make queries fast," and adds fifteen of them across the schema. Reads get fast — and then the nightly batch import starts blowing past midnight and insert-heavy endpoints degrade. Indexing is a trade, and this page teaches both sides of the deal: what an index actually is, what it costs, and how to decide what deserves one.

## 2. The Analogy — Make the Mechanic Obvious

Picture an old university library. Ten million books sit on shelves **in the order they were acquired** — shelf position means nothing about subject or author. That's your table: rows stored in whatever order they arrived.

Nobody finds a book by walking the shelves. They walk to the **card catalog** instead — a set of cabinets holding one small card *per book*, and the cards are **sorted**: the author catalog alphabetically by author, the title catalog alphabetically by title. Each card carries the book's call number — its location on the shelves. That's an index: a separate, sorted, much skinnier structure whose entries point at real rows.

Now notice how the catalog is organized inside, because this maps directly onto the B-tree. A catalog isn't one endless alphabetical run of cards. It's divided into **drawers**, each drawer holding a contiguous slice of the alphabet, and each drawer has a **label** saying the range it covers — "MAC–MAR", "MAR–MEZ". Above the drawers, taped inside the cabinet door, there's often a little map: "drawers 1–20 cover A–F, drawers 21–35 cover G–M..." Finding "Melville" means reading the door map (one glance), jumping to the right handful of drawers (one glance at their labels), opening the exact drawer, and flipping a few dozen sorted cards. You touched maybe four small things instead of ten million books. That's precisely a B-tree lookup: the door map is the root node, the drawer labels are the interior branch nodes, the cards in one drawer are a leaf page, and the call number is the row pointer.

The rest of the library's life maps too:

- **Multiple catalogs** — author, title, subject — are multiple indexes on the same table, each sorted differently because visitors ask different questions.
- **A new book arrives** and the librarian must file a card into *every* catalog, in sorted position. Skip one and that catalog lies. Every addition to the collection costs work in proportion to how many catalogs exist — that's the write penalty, charged on every insert, forever.
- **Some organization is automatic.** The library's own accessions ledger records books by acquisition number — the system's backbone, maintained whether anyone likes it or not. That's your primary key index.
- **Nobody builds a catalog of book-cover colors** — no visitor ever asks for books that way. Catalogs exist for questions people actually ask. Indexes should too.
- And the failure case: someone asks *"which books are red?"* There's no color catalog, so the poor clerk walks every shelf. Worse: a subject catalog with only three subjects — "fiction", "textbook", "reference" — sends you to a drawer holding half the library's cards. Reaching the drawer is instant, but wading through it is nearly as bad as walking the shelves. Sorted access only helps when it narrows things down. That's selectivity.

Keep the picture: shelves = table, cards = index entries, drawers and their labels = B-tree levels, call number = row pointer, filing cards in every catalog = the cost of every write.

## 3. The Full Explanation — How It Actually Works

An index is a **second, smaller copy of one column's values, kept permanently sorted, with each value attached to a pointer that says where its full row lives**. The table itself stays untouched — the index is an extra structure the database maintains silently so certain questions stop requiring a full sweep.

**The structure itself: the B-tree.** Databases use a *balanced tree* — almost universally the B-tree or a close cousin — and the shape is easier than the name suggests. Entries live only in the bottom level, in **leaf pages**, each page holding a few hundred consecutive slices of the sorted values (a "page" being the database's fixed-size read unit, typically 8–16 KB). The level above holds **signposts**: for each leaf, one compact entry saying "everything under me falls between X and Y". Another signpost layer can sit above that. Because every node holds *hundreds* of keys and child pointers (this number is called the **fanout**), the tree is absurdly shallow and wide: three levels handle tens of millions of entries, four handle billions. A lookup loads the root, follows the signpost whose range contains your value, repeats once or twice, lands on the right leaf, and finishes with a quick search inside it — then follows the pointer to fetch the actual row. Three to five page reads, **regardless of whether the table has a thousand rows or a hundred billion**. That flatness is the whole superpower: doubling the data adds roughly *one* extra comparison per level, not twice the work.

Two consequences fall out of "permanently sorted" and they explain half of indexing's value:

1. **Ranges become a starting point plus a stop condition.** All entries for `created_at >= '2026-08-01'` form one contiguous run at the end of the sort order, and B-tree leaves are linked left-to-right, so the engine walks forward and quits the moment the range ends. No checking of non-matching rows ever happens.
2. **Sorting comes free.** Ask for rows `ORDER BY` the indexed column and the engine reads the tree's leaves in order — the explicit sort step vanishes from the query plan. (This generalizes to composite indexes, which are sorted by column one, then column two within equal ones — see the [composite index](what-is-a-composite-index.md) page.)

Growth has one messy moment worth knowing: inserting into a full leaf forces a **page split** — the leaf breaks into two halves and the parent gains a signpost. Sequential keys (auto-increment ids, increasing timestamps) always append at the far right and split rarely; random keys (UUIDs) scatter inserts across the whole tree and split constantly, bloating the index and slowing writes. That's a real reason teams prefer sequential primary keys.

**What gets indexed without you asking — and what never does.** Three defaults matter:

- The **primary key is always backed by an index**, because finding a row by id must be fast and other indexes chain through it. In MySQL InnoDB and SQL Server the table's rows physically live in that primary-key order (a [clustered index](what-is-a-clustered-index.md)); in PostgreSQL the primary key just gets a standard B-tree alongside the heap. See the [primary key](what-is-a-primary-key.md) page for that relationship.
- A **UNIQUE constraint is secretly an index** — enforcing uniqueness on five million rows requires the ability to check "does this value already exist?" instantly, and only a sorted structure provides that. Create the constraint and the database builds the index itself, often under a system-generated name like `sqlite_autoindex_users_1`.
- A **foreign key column gets nothing automatically** in PostgreSQL, SQL Server, and SQLite — a genuine production trap covered in the Traps section. (MySQL's InnoDB is the exception: it auto-creates an index on the foreign key column if none exists.)

Everything else is on you. The candidates are the columns appearing in the `WHERE`, `JOIN ... ON`, and `ORDER BY` clauses of your hottest queries. An ORM will not save you here: SQLAlchemy or Sequelize happily generate `WHERE email = ?` for you, but they create an index on `email` only if your migration says so. Unindexed means scanned.

**The bill: every write pays for every index.** This is the side of the deal people forget, and it's non-negotiable mechanics, not a tuning knob. Each index is a separate tree that must stay truthful:

- Every **INSERT** descends every index tree and files a new entry in sorted position — splitting a page when needed. Five indexes means five tree descents per row inserted.
- Every **DELETE** removes the row's entry from every tree.
- An **UPDATE** touching an indexed column removes and re-files that entry in that tree. Updating the primary key is worse still: since InnoDB's secondary index leaves store the primary key value, changing it ripples into every secondary index on the table.

Beyond raw latency, more indexes mean more transaction-log volume, more buffer-pool memory spent caching index pages instead of data, bigger backups, and slower bulk loads. On my laptop, inserting the same 100,000 rows took 0.055s into an index-free table and 0.292s into an identical table carrying four extra indexes — roughly 5x, and the gap widens with index count. (Bulk-loading a big table? A classic move is to drop the non-essential indexes, load, then rebuild them once — one sort beats millions of incremental filings.)

So indexing is a standing trade: **you pay on every write and in storage, to buy cheap reads on the specific questions you predicted**. That prediction is where selectivity enters.

**Selectivity — the word that decides everything.** Selectivity asks: *of all the rows in the table, what fraction survives my predicate?* `email = 'x'` keeps one row out of millions — supremely selective, and the index hop is obviously worth it. `status = 'active'` when 40% of users are active keeps millions — and now the index path is a disaster, because it means millions of tiny random hops between index and table, while a full scan reads the table once, sequentially, with perfect locality. Somewhere in between sits a gray zone (engines like PostgreSQL offer bitmap index scans precisely for it), and exactly where the crossover falls depends on the engine, the row width, and how well rows correlate with index order. Heuristics: a predicate keeping a few percent or less is a clear index win; tens of percent usually favors scanning. Related term: **cardinality** is the count of distinct values in a column — a high-cardinality column (emails, ids) tends to produce selective equality predicates, which is why "index high-cardinality columns" is decent folk wisdom. But the precise rule is better: **judge the predicate, not the column.** `status` looks hopeless alone, yet `WHERE status = 'banned'` keeping 0.1% of rows is perfectly indexable — and PostgreSQL and SQLite offer **partial indexes** (`CREATE INDEX ... WHERE status = 'banned'`) that store only those rows, tiny and razor-focused — see the [partial index](../postgresql/what-is-partial-index.md) page. MySQL lacks partial indexes but gained functional indexes in 8.0.13. As trailing columns of composite indexes, low-cardinality columns earn their place too, by extending coverage.

One last humility pill: **you don't decide whether the index is used — the query planner does**, by estimating costs from statistics. Your job is to shape indexes around real query patterns, keep statistics fresh (`ANALYZE`), and then verify plans rather than assume — see [reading execution plans](what-is-query-execution-plan.md), [`EXPLAIN ANALYZE`](what-is-explain-analyze.md), and the deeper performance treatment in [how an index improves query performance](how-does-an-index-improve-query-performance.md). Adding an index to a huge live table is itself an operation to respect — PostgreSQL needs `CREATE INDEX CONCURRENTLY` to avoid locking writes — and the honest counterpart page, [when indexes hurt](when-can-indexes-hurt-performance.md), catalogs the ways this trade goes wrong.

## 4. See It In Practice — Real Code or Queries

Everything below runs as-is in `sqlite3 :memory:` (dialect notes flag where PostgreSQL/MySQL differ). Build 100,000 users first:

```sql
CREATE TABLE users (
  id         INTEGER PRIMARY KEY,
  email      TEXT NOT NULL,
  full_name  TEXT NOT NULL,
  city       TEXT NOT NULL,
  created_at TEXT NOT NULL      -- ISO text dates ('YYYY-MM-DD') sort correctly as text
);

CREATE TABLE digits (d INTEGER PRIMARY KEY);
INSERT INTO digits VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

-- Cross join five digit tables -> numbered rows 0..99,999, no scripts needed
INSERT INTO users (email, full_name, city, created_at)
SELECT 'user' || n || '@example.com',
       'User ' || n,
       CASE n % 8 WHEN 0 THEN 'Pune' WHEN 1 THEN 'Mumbai' WHEN 2 THEN 'Delhi'
                  WHEN 3 THEN 'Bengaluru' WHEN 4 THEN 'Chennai' WHEN 5 THEN 'Hyderabad'
                  WHEN 6 THEN 'Kolkata' ELSE 'Jaipur' END,
       date('2023-01-01', '+' || (n % 1300) || ' days')
FROM (
  SELECT d1.d * 10000 + d2.d * 1000 + d3.d * 100 + d4.d * 10 + d5.d AS n
  FROM digits AS d1, digits AS d2, digits AS d3, digits AS d4, digits AS d5
);
```

**The pain: no index on email.** `EXPLAIN QUERY PLAN` shows the strategy (PostgreSQL: `EXPLAIN`; MySQL: `EXPLAIN`; both show a full scan):

```sql
EXPLAIN QUERY PLAN
SELECT id, full_name FROM users WHERE email = 'user42@example.com';
-- QUERY PLAN
-- `--SCAN users        <- tests ALL 100,000 rows to find ONE
```

That `SCAN` is the login story from section 1, at demo scale. Now watch the automatic index you never created — the primary key:

```sql
EXPLAIN QUERY PLAN
SELECT * FROM users WHERE id = 50000;
-- QUERY PLAN
-- `--SEARCH users USING INTEGER PRIMARY KEY (rowid=?)
```

Every database already ships with indexing working on the primary key; `SCAN` happens only where nobody bothered. Fix the email path and the plan flips:

```sql
CREATE INDEX idx_users_email ON users(email);

EXPLAIN QUERY PLAN
SELECT id, full_name FROM users WHERE email = 'user42@example.com';
-- QUERY PLAN
-- `--SEARCH users USING INDEX idx_users_email (email=?)
```

Same result set, opposite universe of effort: `SEARCH` descends the sorted tree straight to the one matching entry. (On PostgreSQL this prints `Index Scan`; MySQL shows `type=ref`.)

**Proof that UNIQUE constraints build hidden indexes.** Fresh table, one constraint, zero explicit `CREATE INDEX` calls:

```sql
CREATE TABLE tags (id INTEGER PRIMARY KEY, slug TEXT NOT NULL UNIQUE);

EXPLAIN QUERY PLAN
SELECT * FROM tags WHERE slug = 'hot';
-- QUERY PLAN
-- `--SEARCH tags USING COVERING INDEX sqlite_autoindex_tags_1 (slug=?)
```

`sqlite_autoindex_tags_1` — the database built that tree itself, because it cannot enforce uniqueness any other way.

**The write tax, measured.** Identical 100,000-row insert, the only difference being four extra indexes (one from `UNIQUE`, three explicit). Timing uses `.timer on` in the sqlite3 CLI:

```sql
.timer on
INSERT INTO writes_plain (...)   -- no extra indexes
-- Run Time: real 0.055

INSERT INTO writes_indexed (...) -- + UNIQUE(email), + indexes on city, created_at, full_name
-- Run Time: real 0.292           <- ~5x slower, same data, same statement
```

Your absolute numbers will differ; the direction never does, and the gap grows with index count. Multiply by your nightly batch volume to feel it.

**Selectivity in numbers.** Eight cities, so each matches 12,500 rows — one eighth of the table:

```sql
SELECT city, count(*) FROM users GROUP BY city;
-- Bengaluru | 12500    (and 7 more rows, all 12500)
```

Compare the work behind two `SEARCH` plans on this data. For `email = ?` the index delivers **one** entry, then one row hop — done. For `city = 'Pune'` the index must deliver **12,500 entries** and then perform up to 12,500 separate hops to scattered rows for their `full_name` values — potentially worse than one clean sequential pass. Interesting wrinkle: SQLite's simple cost model still picks the city index here (especially when the query only needs indexed columns, making the index scan "cheap-looking"); PostgreSQL's planner, which prices random row-hops against sequential reads properly, typically refuses around this ratio and scans. The lesson isn't "engine X is dumb" — it's that **plan choices are estimates, they differ across engines, and you verify on your own engine with real statistics** (`ANALYZE` first).

**Functions defeat indexes — and two honest fixes.** With an index on `created_at`:

```sql
CREATE INDEX idx_users_created ON users(created_at);
ANALYZE;

EXPLAIN QUERY PLAN
SELECT count(*) FROM users WHERE date(created_at) = '2024-06-01';
-- QUERY PLAN
-- `--SCAN users USING COVERING INDEX idx_users_created   <- still O(n): wrapped in
--                                                           date(), the sorted order is unusable
```

Wrapping the column in `date()` asks a question about a function's *output* — the tree is sorted by raw timestamps, so there's no shortcut. Fix one, prefer this: compare the bare column to a range, keeping the function off the column:

```sql
EXPLAIN QUERY PLAN
SELECT count(*) FROM users
WHERE created_at >= '2024-06-01' AND created_at < '2024-06-02';
-- QUERY PLAN
-- `--SEARCH users USING COVERING INDEX idx_users_created (created_at>? AND created_at<?)
```

Fix two, when you're stuck with the function-shaped predicate: index the expression itself (PostgreSQL expression indexes, MySQL 8.0.13+ functional indexes, SQLite as shown):

```sql
CREATE INDEX idx_users_signup_day ON users(date(created_at));

EXPLAIN QUERY PLAN
SELECT count(*) FROM users WHERE date(created_at) = '2024-06-01';
-- QUERY PLAN
-- `--SEARCH users USING COVERING INDEX idx_users_signup_day (<expr>=?)
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What actually is an index?**

A second data structure the database maintains beside the table: the chosen column's values kept permanently sorted in a B-tree, each entry carrying a pointer to its full row. Lookups against an indexed column descend that tree instead of sweeping the table, turning "read every row" into "visit three to five pages." The price: the tree must be updated on every insert, every delete, and every update of the indexed column, plus the disk it occupies. That's the complete concept — everything else is elaboration.

**Q: Walk me through what happens internally when a query hits a B-tree index.**

Take `WHERE email = 'a@b.com'` on a 500-million-row table. The engine loads the root page — a compact array of range boundaries, almost certainly already cached in memory — and picks the child whose range contains the email. It repeats that choice at the next level down, lands on a leaf page holding a few hundred consecutively sorted entries, binary-searches within it, and finds the entry with the row pointer. Then it fetches the actual row — a second hop to wherever the table stores it. Total: three to five page reads, the top levels nearly always served from RAM. The reason the tree never gets tall: each node holds hundreds of keys (fanout), so each level multiplies capacity by hundreds — tens of millions of entries fit in three levels, billions in four. Doubling the table adds one comparison per level.

**Q: Which things does the database index automatically, and which does it not?**

Always: the primary key — row lookup by identity has to be fast, and in engines like InnoDB the table's rows are physically organized by it. Always: every UNIQUE constraint — uniqueness enforcement is implemented as a sorted index that lets the engine check "taken?" in logarithmic time; you'll see system-named indexes like `sqlite_autoindex_*` appear without asking. Not automatic: ordinary columns, including foreign key columns — PostgreSQL, SQL Server, and SQLite leave FK columns bare, so deleting a parent row (or querying children by parent) scans unless you index it yourself; MySQL's InnoDB auto-creates an FK index. And no ORM creates indexes implicitly — declaring the column in Sequelize or SQLAlchemy models generates the same unindexed queries until your migration adds the index.

**Q: How do you decide which columns to index?**

Start from traffic, not from the schema: take the hottest queries — real ones from the slow query log, not imagined ones — and collect the columns they filter, join, and sort on. Prefer predicates that are selective in *production* distributions: a point lookup on email is a guaranteed win; `status = 'active'` matching a third of the table probably isn't, standalone. Combine conditions that travel together into composite indexes ordered equality-first, range-last, respecting the leftmost-prefix rule. Add covering columns for the highest-value queries. Then stop — every additional index taxes every write — and audit periodically: PostgreSQL exposes per-index usage in `pg_stat_user_indexes`, MySQL has similar performance_schema tables, and unused indexes should be dropped like dead code.

**Q: Why not just index every column, since storage is cheap?**

Because storage isn't the scarce resource — write-time work is. Every insert must file an entry into *every* index tree: descend, place, occasionally split a page; every delete cleans entries out of every tree; updating an indexed column moves its entry. Twenty indexes can make a hot insert path many times slower, inflate the transaction log, stretch batch windows past their slot, and push replication lag during bulk jobs. Meanwhile extra indexes buy almost nothing on reads: the planner only uses indexes whose leading columns match the query's predicates and whose selectivity justifies the hop. Storage is cheap; maintaining twenty sorted copies of reality on every mutation is not.

**Q: What is selectivity (cardinality) and why does it determine whether an index helps?**

Selectivity is the fraction of the table a predicate keeps. It decides indexing because the index path costs two things: reaching the matching entries (cheap, always) and hopping to their rows (once per match). At 0.01% selectivity that's a handful of hops — a massive win over scanning. At 30% it's millions of scattered hops versus one efficient sequential read, and scanning wins. Engines encode this arithmetic differently — PostgreSQL has bitmap index scans for the gray zone, SQLite leans index-friendly — so treat the thresholds as heuristics, keep statistics current with `ANALYZE`, and confirm with `EXPLAIN` what your planner actually chose. Corollary worth volunteering: low-cardinality columns aren't banned — they shine as trailing composite columns and in partial indexes, because what matters is the predicate's slice size, not the column's overall variety.

**Q: You added an index and the query didn't get faster. What are your suspects?**

In rough frequency order: the predicate wraps the column in a function or expression (`DATE(created_at)`, `LOWER(email)`), hiding the raw sorted values — rewrite as a bare-column range or add an expression index; a leading-wildcard `LIKE '%term%'`, which can't seek into unknown front positions (trailing wildcards can); composite columns used out of order, violating the leftmost-prefix rule; the predicate isn't selective enough, so the planner rightly scans; a type mismatch forcing casts before comparison; stale statistics making the planner misestimate match counts — refresh with `ANALYZE`. The discipline underneath all of it: read the plan after every change (`EXPLAIN ANALYZE` on PostgreSQL, `EXPLAIN` on MySQL) instead of trusting that creation implies usage. Full debugging workflow lives in [debugging a slow query](how-do-you-debug-a-slow-query.md).

**Q: Do indexes ever help writes?**

Almost never — the default answer is "they slow every write, that's the trade," and saying it plainly signals seniority. Two honest footnotes: a foreign-key index protects delete *correctness and speed* on the parent side (finding referencing children instantly instead of scanning, and avoiding heavy locking in MySQL), and partial indexes can shrink write maintenance versus their full-table alternatives. But those refine the trade; they don't reverse it.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Indexing every column "to be safe."**
The wrong assumption: indexes are pure upside, so more coverage means more safety. Why it's wrong: each index is a second sorted copy of reality that every INSERT, DELETE, and indexed-column UPDATE must maintain — the cost isn't at creation time, it's on every write forever, plus log volume, memory pressure, and backup size. What actually happens: a team sprinkles indexes during incident response until a table carries nine of them; inserts go from 2ms to 15ms, the nightly import misses its window, replication lag spikes every evening, and nobody connects it to the index spree because the damage is diffuse. The fix: index deliberately from observed query shapes, audit actual usage (`pg_stat_user_indexes` in PostgreSQL, performance_schema in MySQL), drop the unused, and remember redundancy — an `(a)` index is pure overhead the moment `(a, b)` exists, since the wider one serves everything the narrow one could. The dedicated treatment is in [when indexes hurt](when-can-indexes-hurt-performance.md).

**Trap 2: Wrapping the indexed column in a function.**
The wrong assumption: an index on `created_at` serves any condition *about* `created_at`, including `WHERE DATE(created_at) = '2024-06-01'`. Why it's wrong: the B-tree is sorted by the raw timestamp values, and a condition on their truncated dates describes a different ordering entirely — the engine cannot seek into a sort that doesn't exist. What actually happens: you ship the "optimized" migration, the plan still shows a scan, the dashboard is still slow, and someone concludes indexes don't work on this table. The fix, demonstrated in section 4: rewrite as a half-open range on the bare column — `created_at >= '2024-06-02' AND created_at < '2024-06-03'` — which works on every engine; or create an expression/functional index on exactly that function when stuck with it. The same disease wears other coats: leading-wildcard `LIKE '%corp%'` and silent type casts in comparisons. Habit that catches all of them: `EXPLAIN` after every change, not vibes.

**Trap 3: Assuming foreign keys come with indexes.**
The wrong assumption: declaring `REFERENCES users(id)` makes lookups by `user_id` fast. Why it's wrong: the constraint declares integrity, not access paths — PostgreSQL, SQL Server, and SQLite build no index on the referencing column, so "fetch all orders for user 42" scans the orders table, and deleting a popular user triggers a scan hunting for orphaned children (or worse, heavy locking under concurrent writes). What actually happens: the app works at small scale, then parent deletes start timing out years later and the cascade is blamed for "being slow" rather than being unindexed. The fix: every foreign key column used in joins or child-side lookups gets an explicit index in your migrations; know that MySQL/InnoDB is the outlier that does this automatically.

**Trap 4: Believing "the index exists, therefore it's used."**
The wrong assumption: creating an index is a contract that queries will take it. Why it's wrong: the planner re-decides per execution from statistics and cost estimates — it may scan because your predicate matched 40% of rows, because stats are stale and it guessed badly, or because the query shape can't exploit the sort order at all. What actually happens: the ticket gets closed as "index added," the query stays slow, and trust in indexing erodes over what was a verification failure. The fix: run `ANALYZE` after bulk data changes, read the actual plan (`EXPLAIN ANALYZE` shows real timings and estimated-vs-actual row counts), and treat "plan changed from SCAN to SEARCH" as the definition of done. Also respect the operation itself: building an index on a large live table locks writes on PostgreSQL unless you use `CREATE INDEX CONCURRENTLY`.

## 7. Compare With Related Concepts

**Index vs full table scan.** Not hero versus villain — two priced options. Scans win for small tables, low-selectivity predicates, and "aggregate most of the table" analytical reads; indexes win targeted, selective lookups. Rule: index the predicates your OLTP traffic actually sends; let the scanner have the rest.

**Clustered vs non-clustered (secondary) index.** A clustered index *is* the table — rows physically stored in key order (InnoDB's primary key, SQLite's rowid behavior); a secondary index is a separate sorted copy pointing at rows. One clustered per table, many secondary. Rule: cluster by your most frequent full-row access path; hang secondary indexes off the remaining hot predicates — details in [clustered](what-is-a-clustered-index.md) and [non-clustered](what-is-a-non-clustered-index.md) pages.

**Single-column vs composite index.** A single-column index sorts by one thing; a composite sorts by column one, then two within ties, serving leftmost-prefix queries and multi-condition filters at once — but refusing to lead from its second column. Rule: one composite shaped like each hot query beats a pile of singles the planner can't combine well — see [composite indexes](what-is-a-composite-index.md).

**Ordinary index vs covering index.** An ordinary index finds rows, then hops to the table for the remaining columns; a covering index contains every column the query needs, so the hop disappears entirely (`USING COVERING INDEX` in SQLite, `Index Only Scan` in PostgreSQL, `Using index` in MySQL). Rule: widen an index into a covering one only for your highest-value queries — width costs write time — see [covering index](what-is-covering-index.md).

**Ordinary index vs unique index/constraint.** Both are B-trees; a unique one additionally enforces correctness — it's *how* the database rejects duplicates in logarithmic time. Rule: model rules as constraints (you get the index for free); add plain indexes only for performance.

**B-tree vs hash index.** A hash index maps exact keys to locations — blazing equality lookups, but helpless for ranges, sorting, or prefix matches, since hash order preserves nothing. B-trees do equality *and* ranges and ordering. Rule: B-tree unless you have a measured, equality-only hotspot that specifically rewards hashing.

**Index vs application cache.** An index makes the database hit itself cheaply and never lies; a cache avoids the database and can serve stale or missing data. Rule: index correctly first, cache the residual hot spots profiling proves remain expensive.

## 8. 🧠 The Memory Hook

An index is the library's card catalog bolted onto your table: sorted cards pointing at shelves, organized in labeled drawers so any book is found in a few glances no matter how vast the collection. But every new book must be filed into *every* catalog, forever — and a catalog nobody searches, or one that dumps half the library in a single drawer, is pure filing labor. Sort what you search, pay the filing on every write, and verify the librarian actually uses your catalog.
