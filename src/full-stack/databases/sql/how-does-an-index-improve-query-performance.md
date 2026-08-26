# How Does an Index Improve Query Performance?

## 1. The Real-World Problem — When You Actually Hit This

It's three months after launch. Your admin dashboard loads customer orders instantly — the query is an innocent-looking `SELECT * FROM orders WHERE customer_id = ?` and in development it returns in about 20ms against your 4,000 test rows. Then the business grows. One morning support starts forwarding angry tickets: the order history page sometimes takes six seconds, occasionally times out, and the database server's CPU is pinned at 100% while the app servers sit idle doing nothing.

You pull the slow query log and there it is: your friendly little query, executed thousands of times an hour, each execution reading **every row in the orders table** to find maybe fifty matching ones. The table went from 4,000 rows to 40 million, and the query got slower in exact proportion. Nothing is broken. Nothing crashed. The database is simply doing precisely what it was told: check every single row, one at a time, because you never gave it a faster way to find them.

That faster way is an index. Adding one turns that six-second crawl into a millisecond lookup — not by magic, but by changing where the database has to look. This page explains exactly how that works, what it costs, and every way it fails in interviews and in production.

## 2. The Analogy — Make the Mechanic Obvious

Think of the index at the back of a big textbook. You need every page that mentions "photosynthesis". Two options: read all 800 pages and mark every mention, or flip to the back where an alphabetically sorted list says `photosynthesis — 112, 340, 412, 587` and jump straight to those four pages. That's the entire trick.

Now map each piece to the database, because every part lines up:

- **The terms in the back index** are the values of your column (`customer_id`), kept **sorted** — that's what lets you find any term quickly instead of hunting.
- **The page numbers next to each term** are row pointers. The index never contains the full row; it contains the value plus "where the real data lives".
- **Flipping straight to the right spot** in a sorted list is cheap even for a huge book, because sorted order means you can halve your search space over and over. Databases do the same thing with a structure called a **B-tree**: a shallow, bushy tree where each level cuts the candidates down enormously, so finding anything among hundreds of millions of entries takes a handful of steps.
- **Jumping to page 412 to read the actual content** is the database fetching the actual row after the index finds it. Two hops: index first, row second.
- **A second index in the book** (say, an index of figures) is a second index on the table — another sorted copy of another column, with its own pointers.
- **Publishing costs**: every time the authors change a chapter, the publisher must update every index at the back or they start lying. Same in the database — every insert, delete, and update of an indexed column must update every index. That's the bill you pay for fast lookups.
- And the failure case maps too: if someone asks *"which pages contain the letter 'e'?"* the index is worthless — the answer is everywhere, and flipping back and forth 800 times is slower than just reading. When a query matches a huge slice of the table, reading straight through is genuinely cheaper than doing ten thousand tiny index jumps.

Keep this picture. Everything below is just naming the parts.

## 3. The Full Explanation — How It Actually Works

**Start from the table with no index.** The table stores rows in whatever order they were inserted — customer 88231, then 104, then 55902. Sorted by nothing useful. So when you ask for `customer_id = 42`, the database has exactly one correct strategy: read **every row** (really, every disk page holding rows) and test each one. This is called a **full table scan**, it costs time proportional to the number of rows, and it happens even if only one row matches.

**Now add an index.** When you write `CREATE INDEX ON orders(customer_id)`, the database builds a second, smaller structure: just the `customer_id` values copied out and sorted, each attached to a pointer to its row. The structure is a **B-tree** — a tree whose nodes each hold hundreds of keys and hundreds of child pointers (that's called the fanout). Because each node is so wide, the tree stays absurdly shallow: with a fanout of a few hundred, three levels cover around a hundred million entries. A lookup walks root → branch → leaf, touching maybe 3–5 pages total, **no matter how big the table gets**.

Two things follow from the values being sorted, and they're the heart of the answer:

1. **Point lookups get logarithmic.** Finding `customer_id = 42` is a tree descent, not a sweep. Scan cost grows linearly with the table; index lookup cost barely moves as the table grows. That's why the fix survives the next 10x of growth while "we optimized the query" tricks don't.
2. **Ranges become contiguous slices.** All of customer 42's rows sit together in the sorted index, and B-tree leaves are linked in order. So `customer_id = 42 AND created_at >= '2024-06-01'` doesn't just find the start point — it reads forward until the range ends and stops. And if you `ORDER BY` in the same direction as the index, the rows come out already sorted: the database skips the sort step entirely. You'll see this visibly in the query plans below.

One more hop to know about: the index gives you a *pointer*, so for most queries the database makes a second trip to the table to fetch the rest of the columns. Different databases organize that hop differently. MySQL's InnoDB stores the whole table inside a B-tree ordered by the primary key (a **clustered index**), and a secondary index's leaf holds the primary key value — so it descends the secondary tree, then descends the clustered tree. PostgreSQL keeps tables as unordered heaps, and the index leaf points directly at the physical row location. SQLite aliases `INTEGER PRIMARY KEY` to the internal rowid, which behaves like the clustered case. The details differ; the shape — sorted keys, then a hop to the row — is the same.

**The catch: what you pay.** An index is not free speed. Three bills arrive:

- **Writes get slower.** Every `INSERT` must place an entry into *every* index on the table, descending each tree, occasionally splitting pages. Every `DELETE` removes entries. An `UPDATE` of an indexed column deletes and reinserts the entry in that tree. Double the indexes, roughly double the index work per write — and extra writes to the transaction log too. Bulk imports feel this hardest.
- **Storage grows.** Each index is a full sorted copy of that column plus pointers. On a billion-row table, that's real gigabytes.
- **The optimizer gets more decisions to make** (and statistics to maintain), though this matters far less than people fear.

So indexing is a bet: you spend write throughput and disk to buy read latency on specific access patterns. The bet pays off when the indexed column appears in the `WHERE`/`JOIN`/`ORDER BY` clauses of your hot queries, and the predicate is **selective** — meaning it narrows the table down to a small fraction of rows. A `status` column with three values isn't very selective alone: matching a third of the table through an index means millions of tiny random row-hops, which loses badly to one efficient sequential read. That's why the optimizer sometimes looks at your beautiful index and chooses a full scan anyway. It's not broken; the arithmetic is against you.

Which brings up the last piece: **you don't control whether the index is used**. The query planner estimates the cost of each candidate plan from statistics and picks the cheapest. Your job is to give it a good index shaped like your query and then *verify* with `EXPLAIN` (see below), not to assume usage.

## 4. See It In Practice — Real Code or Queries

Everything below runs as-is on `sqlite3 :memory:` (the plan wording differs slightly on PostgreSQL and MySQL — noted where it matters). First, build a realistic table and seed 100,000 orders across 1,000 customers:

```sql
CREATE TABLE orders (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL,
  status       TEXT    NOT NULL,
  total_cents  INTEGER NOT NULL,
  created_at   TEXT    NOT NULL      -- ISO dates ('YYYY-MM-DD') sort correctly as text
);

CREATE TABLE digits (d INTEGER PRIMARY KEY);
INSERT INTO digits VALUES (0),(1),(2),(3),(4),(5),(6),(7),(8),(9);

-- Cross join five digit tables = 100,000 numbered rows, no stored procedure needed
INSERT INTO orders (customer_id, status, total_cents, created_at)
SELECT n % 1000,
       CASE n % 3 WHEN 0 THEN 'pending' WHEN 1 THEN 'paid' ELSE 'refunded' END,
       (n % 90000) + 100,
       date('2024-01-01', '+' || (n % 730) || ' days')
FROM (
  SELECT d1.d * 10000 + d2.d * 1000 + d3.d * 100 + d4.d * 10 + d5.d AS n
  FROM digits AS d1, digits AS d2, digits AS d3, digits AS d4, digits AS d5
);
```

**Baseline: no indexes.** Turn on timing (`.timer on` in the sqlite3 CLI) and ask SQLite how it will execute the hot query with `EXPLAIN QUERY PLAN`. On PostgreSQL this is `EXPLAIN ANALYZE SELECT ...` (shows `Seq Scan` vs `Index Scan`); on MySQL it's `EXPLAIN SELECT ...` (shows `type=ALL` for a full scan):

```sql
EXPLAIN QUERY PLAN
SELECT sum(total_cents) FROM orders WHERE customer_id = 42;
-- QUERY PLAN
-- `--SCAN orders          <- reads ALL 100,000 rows, tests every one

.timer on
SELECT sum(total_cents) FROM orders WHERE customer_id = 42;
-- Run Time: real ~0.002   (a couple of ms here; grows LINEARLY as rows grow)
```

Two milliseconds sounds fine — until you multiply by rows. Linear cost means 100x the data is 100x the wait. Now the fix:

```sql
CREATE INDEX idx_orders_customer ON orders(customer_id);

EXPLAIN QUERY PLAN
SELECT sum(total_cents) FROM orders WHERE customer_id = 42;
-- QUERY PLAN
-- `--SEARCH orders USING INDEX idx_orders_customer (customer_id=?)

SELECT sum(total_cents) FROM orders WHERE customer_id = 42;
-- Run Time: real <0.0005  (sub-millisecond — and stays there as the table grows)
```

Same result, same SQL. The only change is that the planner swapped `SCAN` (touch everything) for `SEARCH` (descend the sorted tree straight to customer 42's ~100 rows). Read the plan, not your hopes — this is how you *prove* an index worked.

**Indexes speed up sorting and ranges too.** Watch what SQLite admits to when there's no usable index for this one:

```sql
EXPLAIN QUERY PLAN
SELECT id, total_cents FROM orders
WHERE customer_id = 42 AND created_at >= '2024-06-01'
ORDER BY created_at;
-- QUERY PLAN
-- |--SCAN orders
-- `--USE TEMP B-TREE FOR ORDER BY     <- collects matches, then SORTS them
```

A composite index on `(customer_id, created_at)` fixes both problems at once, because the entries are sorted by customer first, and *within* each customer by date:

```sql
CREATE INDEX idx_orders_cust_created ON orders(customer_id, created_at);

EXPLAIN QUERY PLAN
SELECT id, total_cents FROM orders
WHERE customer_id = 42 AND created_at >= '2024-06-01'
ORDER BY created_at;
-- QUERY PLAN
-- `--SEARCH orders USING INDEX idx_orders_cust_created (customer_id=? AND created_at>?)
```

The sort line is gone. The index hands rows over already in `created_at` order, and the range stops as soon as it exits the matching slice. One index, three wins: filtered fast, ranged fast, sorted free.

**The covering index — skipping the second hop entirely.** If the index happens to contain every column the query needs, the database never visits the table at all:

```sql
CREATE INDEX idx_orders_covering ON orders(customer_id, status, total_cents);

EXPLAIN QUERY PLAN
SELECT status, sum(total_cents) FROM orders
WHERE customer_id = 42
GROUP BY status;
-- QUERY PLAN
-- `--SEARCH orders USING COVERING INDEX idx_orders_covering (customer_id=?)
```

See the word `COVERING`: the answer came entirely out of the index. On PostgreSQL this shows as an `Index Only Scan`; on MySQL as `Using index` in the Extra column. It's the cheapest read path a relational database offers.

**And when the planner refuses your index — correctly.** These are real outputs with the above indexes in place:

```sql
EXPLAIN QUERY PLAN
SELECT count(*) FROM orders WHERE status = 'pending';
-- QUERY PLAN
-- `--SCAN orders USING COVERING INDEX idx_orders_covering

EXPLAIN QUERY PLAN
SELECT count(*) FROM orders WHERE date(created_at) = '2024-06-01';
-- QUERY PLAN
-- `--SCAN orders USING COVERING INDEX idx_orders_cust_created

EXPLAIN QUERY PLAN
SELECT id FROM orders WHERE created_at LIKE '%2024-07%';
-- QUERY PLAN
-- `--SCAN orders USING COVERING INDEX idx_orders_cust_created
```

Three refusals, three different reasons: `'pending'` matches ~33,000 rows, so hopping through the index 33k times loses to one sequential sweep (though the planner still sweeps the *skinniest* copy of the data — notice it scans the covering index rather than the fat table — clever, but still O(n)); `date(created_at)` hides the raw column behind a function, so the sorted order of `created_at` is useless; and `LIKE '%2024-07%'` can't descend a sorted tree because the match position is unknown at the front. None of these mean the database is stupid — each refusal is the planner doing the math we covered in section 3.

## 5. Interview Questions — All of Them, Done Properly

**Q: How does an index actually make a query faster?**

Without an index the only way to find matching rows is a full table scan — read every row, test it, keep the survivors. Cost grows linearly with table size, even if one row matches. An index adds a second, small structure: the indexed column's values kept sorted in a B-tree, each with a pointer to its row. A lookup descends that tree — a handful of pages regardless of table size — lands directly on the matching values (which sit together because the list is sorted), then fetches those rows. Point lookups go from O(n) to O(log n) with a tiny constant; range queries read only the matching slice; and if the `ORDER BY` matches the index order, the sort step disappears too. The honest senior answer includes the price tag: every write must now update every index, and the index costs storage.

**Q: If indexes are so effective, why not index every column?**

Because every index is a tax on every write. Each `INSERT` must add an entry to each index's B-tree (descend, place, occasionally split a page), each `DELETE` removes one, and updating an indexed column moves its entry. Ten indexes can easily dominate the cost of a hot insert path, bloat the transaction log, and slow batch jobs to a crawl — plus the storage. Meanwhile extra indexes rarely help reads: the planner only uses indexes whose leading columns match the query's predicates and whose selectivity justifies the hop. So you index deliberately: the columns in your frequent `WHERE`/`JOIN`/`ORDER BY` clauses, in composite order matching the query shape, and you periodically audit for unused indexes (PostgreSQL exposes usage counters in `pg_stat_user_indexes`; MySQL has similar performance_schema tables) and drop the dead weight.

**Q: Why is the optimizer ignoring my index?**

The usual suspects, in rough order of how often I've seen them: the predicate wraps the column in a function or expression (`WHERE DATE(created_at) = ...`, `WHERE LOWER(email) = ...`) — compare the bare column to a range or use a functional/expression index instead; a leading-wildcard `LIKE '%term%'` can't use sorted order (trailing wildcards can); the composite index's columns are used out of order, violating the leftmost-prefix rule; the predicate isn't selective enough, so a scan is genuinely cheaper; types mismatch, so values get cast before comparison (MySQL's silent string-to-number cast is a notorious index killer); or statistics are stale, making the planner misestimate how many rows match — fixed by running `ANALYZE` (Postgres/SQLite) or letting InnoDB re-sample. Verify rather than guess: `EXPLAIN ANALYZE` on PostgreSQL, `EXPLAIN` on MySQL, `EXPLAIN QUERY PLAN` on SQLite.

**Q: What is selectivity (cardinality) and why does it decide everything?**

Selectivity is what fraction of the table a predicate keeps. `customer_id = 42` might keep 0.1% — extremely selective — so the index hop is a massive win. `status = 'pending'` with three statuses keeps ~33%, and at that ratio the math flips: the index path pays random-I/O costs per matching row, while a sequential scan reads the table once with perfect locality. Somewhere between those extremes the planner switches strategies — PostgreSQL literally has a middle plan called a Bitmap Index Scan for the gray zone. Practical consequences: low-cardinality columns are poor standalone indexes but excellent *trailing* columns in composites (they let the index cover more queries), and "just add an index" is only correct when the predicate is selective in real production data, not in your dev fixtures.

**Q: What is a covering index, and why is it such a big deal?**

Normally an index lookup is two hops: find matching entries in the index, then visit the table to collect the remaining columns — that second hop is a random access per row. A covering index contains every column the query needs, so the second hop vanishes: the database answers from the index alone (SQLite prints `COVERING INDEX`, PostgreSQL calls it `Index Only Scan`, MySQL says `Using index`). Since index entries are compact and often cached, this can be an order of magnitude cheaper than an ordinary indexed read on large tables. The trade-off is that wider indexes cost more storage and more write maintenance, so you cover the queries that matter most rather than stuffing every column into an index.

**Q: Do indexes help INSERT, UPDATE, and DELETE performance?**

Almost never — they hurt, and saying so plainly is the senior move. Every write must update each index's tree, so write cost grows with index count. `UPDATE`s pay extra when they touch an indexed column, since that's a remove-and-reinsert in that tree. Deletes must clean entries out of every tree. The exceptions worth mentioning: indexes on foreign-key columns protect *delete correctness* (the parent-side delete must find referencing children quickly, and MySQL's InnoDB requires an index on the foreign key to avoid locking scans), and partial/expression indexes can make specific write-heavy patterns cheaper indirectly — but as a rule, writes fund the reads. That's the trade-off statement interviewers want to hear.

**Q: Does the order of columns in a composite index matter?**

Yes, completely. An index on `(customer_id, created_at)` sorts by customer, then by date *within* each customer. It serves queries filtering on `customer_id` alone, on both, or on `customer_id` plus a date range — but it cannot efficiently serve a query filtering only on `created_at`, because date values are scattered across all the customer groups (the leftmost-prefix rule). The ordering principle: equality predicates first, then the range/sort column last, so the index can both seek and hand back pre-sorted rows. A `(created_at, customer_id)` index built for a `customer_id = ? AND created_at >= ?` query wastes almost all of its selectivity.

**Q: How do you verify an index helped, and what do you monitor afterwards?**

Before: capture the plan — `EXPLAIN ANALYZE` on PostgreSQL actually executes and shows real timings plus rows-vs-estimates; MySQL's `EXPLAIN ANALYZE` (8.0+) does the same; SQLite's `EXPLAIN QUERY PLAN` shows `SCAN` vs `SEARCH`. After deploying: watch p95/p99 latency for the affected endpoints (this is the user-visible win — a 6-second query is an API timeout problem, not just a DB problem), keep the slow query log on so regressions surface themselves, and review index usage statistics monthly to find dead indexes. Also monitor write latency on heavily indexed tables — if you fixed reads by adding three indexes, insert-heavy periods may have quietly gotten slower.

**Q: Is building an index safe to do on a live production table?**

It depends on the database, and knowing this is a strong signal. On PostgreSQL, a plain `CREATE INDEX` locks the table against writes while it builds — on a big table that's an outage — so you use `CREATE INDEX CONCURRENTLY`, which builds without blocking writes (takes longer, can't run inside a transaction, and leaves an invalid index behind if it fails, which you must drop and retry). Modern MySQL builds most secondary indexes online, allowing concurrent DML. Either way, the build itself is expensive: full table read plus sort plus heavy I/O, so you schedule it off-peak and watch replication lag, because the build replicates too. "I'd add the index in a migration using CONCURRENTLY and verify the plan changed" is the complete answer.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: "I added the index, so the query is fixed" — but the predicate can't use it.**
The wrong assumption: an index on `created_at` helps any query mentioning `created_at`. Why it's wrong: the index is sorted by the *raw* column value, and the planner can only exploit that order if the predicate compares the bare column. `WHERE date(created_at) = '2024-06-01'` asks a question about a function's output — the tree is sorted by timestamps, not by their truncated dates, so it's a scan. What actually happens: you ship the migration, the plan still shows a scan, the page is still slow, and everyone concludes "indexes don't help us". The fixes, in preference order: rewrite as a half-open range — `created_at >= '2024-06-01' AND created_at < '2024-06-02'` — which is sargable (search-argument-friendly), index-friendly, and uses the index on any database; or create an expression index on exactly that function (PostgreSQL and SQLite support expression indexes; MySQL 8.0.13+ calls them functional indexes). The same disease wears other coats: leading-wildcard `LIKE '%corp%'`, and casting the column (`WHERE varchar_col = 123` in MySQL silently converts every row's value to a number before comparing — index dead). The habit that catches all of them: read the `EXPLAIN` output after every "performance fix", not just the wall-clock of your laptop.

**Trap 2: Treating a composite index like a bag of columns.**
The wrong assumption: an index on `(customer_id, created_at)` accelerates filters on either column. Why it's wrong: sorted-by-customer-then-date means date values are spread across every customer group — there's no contiguous slice of dates to jump to. What actually happens: queries filtering only on `created_at` scan, dashboards filtering "all orders today" stay slow, and nobody understands why the "right" index is ignored. The fix: order composite columns by the query — equality columns first, range/order column last — and add a separate index if a different column genuinely leads its own hot query. One index per query shape beats one index worshipped by every query.

**Trap 3: Believing indexes are basically free.**
The wrong assumption: an index costs some disk, and disk is cheap. Why it's wrong: the recurring cost is write-time work — every insert updates every index, splits pages, and generates extra log records — plus buffer-pool memory spent caching index pages instead of data. What actually happens: a team "just adds indexes" during incident response until a table has nine of them; inserts that took 2ms take 15ms, nightly batch windows blow past midnight, and replication lag spikes during every bulk job. The fix: treat indexes like code — reviewed, owned, and audited. Check actual usage (`pg_stat_user_indexes` in Postgres, `sys.schema_unused_indexes` in MySQL) and drop what no query uses; remember redundancy too — an index on `(a)` is pure overhead once `(a, b)` exists, because the bigger index serves every query the smaller one could.

**Trap 4: "Never index low-cardinality columns" — stated as an absolute.**
The wrong assumption: a column with few distinct values (status, flags) is useless as an index. Why it's wrong: it's true *standalone* — matching a third of the table through an index loses to a scan, as we saw the planner prove earlier — but the conclusion doesn't extend to compositions. As the trailing column of a composite index, a low-cardinality column extends coverage (more queries answered without touching the table), and partial indexes flip the logic entirely: `CREATE INDEX ON orders(customer_id) WHERE status = 'pending'` (supported in PostgreSQL and SQLite; MySQL has no partial indexes) indexes *only* the pending rows, so the "unselective" predicate becomes ultra-selective, with a tiny footprint. What actually happens if you hold the absolute belief: teams leave hot paths like "find my pending orders" unindexed for years. The fix: judge the *predicate*, not the column — a predicate is indexable when it selects a small slice, whatever the column's cardinality is overall.

## 7. Compare With Related Concepts

**Index vs full table scan.** Not enemies — alternatives the planner prices against each other. Scans are the right call for small tables, low-selectivity predicates, and "aggregate something from most of the table" analytical reads; indexes win selective point/range lookups. Rule: index the predicates your OLTP traffic actually sends; let the scanner have everything else.

**Clustered vs non-clustered (secondary) index.** A clustered index *is* the table — rows physically organized in the key's order (InnoDB's primary key, SQL Server's clustered index, SQLite's `WITHOUT ROWID` tables); a secondary index is a separate sorted copy pointing at the rows. There can be only one clustered index per table (rows live in one order) but many secondary ones. Rule: pick the primary key for how rows are accessed most, then hang secondary indexes off the other hot predicates — see [clustered](what-is-a-clustered-index.md) and [non-clustered](what-is-a-non-clustered-index.md) pages.

**Index vs partitioning.** Both reduce work, at different granularities: an index finds the matching rows *within* a table; partitioning chops the table into pieces so whole chunks are skipped (`WHERE created_at >= '2026-01-01'` never opens old partitions). They compose — a partitioned table still wants indexes inside each partition. Rule: partitions for coarse time/tenant boundaries, indexes for precise value lookups; see [partitioning](what-is-partitioning.md).

**Index vs cache (Redis/application-level).** A cache avoids the database entirely by keeping hot results closer; an index makes the database hit itself cheap. Different failure modes too: caches serve stale data and miss cold keys; indexes never lie but only help queries they were designed for. Rule: index first — it's consistent and permanent; cache the residual hot spots after profiling proves the indexed query is still the bottleneck. For the broader picture see [debugging a slow query](how-do-you-debug-a-slow-query.md), [reading EXPLAIN ANALYZE](what-is-explain-analyze.md), [composite](what-is-a-composite-index.md) and [covering](what-is-covering-index.md) indexes, and the honest counterpart [when indexes hurt](when-can-indexes-hurt-performance.md).

## 8. 🧠 The Memory Hook

An index is the sorted list at the back of the textbook: values in order, page numbers attached — find the term in seconds, jump straight to the pages, never read all 800. The database version is a B-tree, so a lookup touches a handful of pages no matter how many billions of rows exist — but every edit to the book forces the publisher to update every index at the back, forever. Sort what you search, verify with `EXPLAIN`, and remember the planner is allowed to say "reading the whole book is faster" whenever your predicate isn't selective enough to argue.
