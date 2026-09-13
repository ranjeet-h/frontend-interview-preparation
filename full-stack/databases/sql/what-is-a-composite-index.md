# What Is a Composite Index

## 1. The Real-World Problem — When You Actually Hit This

Your team ships an admin dashboard for a SaaS app. There's an orders table, and the dashboard filters it three ways at once: which tenant, which order status, and a date range. At launch the table has 40,000 rows and the query returns in milliseconds. Eight months later the table has 20 million rows and the same dashboard takes six seconds to load. Support tickets pile up, and someone says the obvious thing: "just add an index."

So you add one on `status`. Nothing improves. Someone else adds one on `created_at`. Still slow. Here's the part nobody tells you: **two separate single-column indexes don't combine.** When your query filters on three columns together, the database can seek directly into only one of those indexes — the others become a filter it applies row by row over whatever the first index matched. If `tenant_id` narrows 20 million rows down to 400,000, the database checks `status` and the date on each of those 400,000 rows individually.

The fix is a different kind of index entirely: one index built from several columns, in a specific order. That's a composite index. And it comes with a catch that trips up almost everyone — the order of those columns decides which queries the index helps and which ones it completely ignores.

## 2. The Analogy — Make the Mechanic Obvious

Think of a phone book. A phone book is sorted by **last name first, then first name**. That single fact explains almost everything about composite indexes.

The phone book is a separate copy of contact info arranged in a useful order — that's what an index is: a smaller, sorted copy of some table columns, kept in order so you can find things fast.

Now watch how the sort behaves:

You want "Patel, Anika." You flip straight to the P section, slide down to the Patels, and within the Patels the first names run alphabetically. You land on her in seconds. In database terms, you did a direct seek using both columns.

You want every Patel. Also easy — they're one contiguous block. Filtering hard on the first column gives you a clean slice of the book.

You want Patels whose first name falls between Anika and Deep. Still easy — because you pinned the last name first, first names are sorted *within* that block. This is the pattern "equality on the first column unlocks ranges on the second."

Now the failure case. You want every person named Anika in the city. Good luck. There's an Anika Adams, an Anika Baker, an Anika Chen — Anikas are scattered across every single last-name section. The only way to find them all is to read the whole book cover to cover. **Skipping the first column destroys everything**, because the second column is only sorted *inside* each first-column section.

That's the core mechanic: the sorting is hierarchical. Column one defines the big sections. Column two sorts things only within each section. Column three sorts within each section-plus-second-column combo, and so on. Every property of composite indexes — what they help, what they ignore, where the range column goes — falls out of this one idea.

## 3. The Full Explanation — How It Actually Works

In plain language: a composite index is one extra data structure — almost always a B-tree, a tree of sorted keys where lookups walk from the top down, discarding half the remaining possibilities at each level — where each entry holds several columns glued together as one key, compared left to right. Rows end up ordered by the first column; ties on the first column are ordered by the second; ties on both by the third. It's the phone book, mechanically.

From that ordering, three rules follow naturally.

**Rule one: the leftmost prefix rule.** An index on `(a, b, c)` can serve any query that filters on a continuous chain starting from the front: `a` alone, `a` and `b`, or `a`, `b`, and `c`. It cannot serve `b` alone or `c` alone, because there's no section of the tree where `b` values live together — they're spread across every `a` value. One practical consequence: if you have `(a, b)`, you do not need a separate index on `(a)` — the composite already handles `a`-only queries perfectly well.

**Rule two: equality columns first, the range column last.** Suppose you often run `WHERE tenant_id = 7 AND status = 'shipped' AND created_at > '2026-01-01'`. The ideal index is `(tenant_id, status, created_at)`. Here's why the date goes last: the moment the database hits a range condition on a column, it has a span of entries rather than a single point. Within that span, later columns are only sorted per individual value of the ranged column — across the whole span, they're scrambled. So `created_at` can carve the search space down to a precise starting point, but anything sitting after `created_at` in the index can no longer *narrow* the search; it can merely be checked entry by entry within it. Put the equality columns up front so the seek stays sharp, and let the range ride at the back where being fuzzy costs nothing.

**Rule three: the order of conditions in your SQL text doesn't matter.** Writing `WHERE created_at > '2026-01-01' AND tenant_id = 7 AND status = 'shipped'` uses the exact same index as writing them in column order. The query planner matches on the *set* of columns, not their textual arrangement. People reorder WHERE clauses trying to "help" the planner and waste effort — it reorders internally anyway.

What you gain and what you pay. On reads, you trade scanning millions of rows for seeking directly into the matching slice — often thousands of times fewer rows touched. On writes, every index is a second (or fifth) place the row must be inserted in order: each `INSERT`, `UPDATE` of an indexed column, and `DELETE` pays that cost on every index on the table. Storage grows too. The senior move is building indexes around your real query shapes — pull the top queries from your slow-query log, design one index per recurring shape — not sprinkling indexes on every column that appears anywhere.

A few interactions with the rest of the system worth knowing:

- ORMs make you declare these deliberately. Prisma has `@@index([tenantId, status, createdAt])`, SQLAlchemy has `Index("idx_orders_tenant_status_created", "tenant_id", "status", "created_at")` on the table args. The ORM will not invent the right column order for you.
- On Postgres, adding an index takes a lock that blocks writes by default; production migrations use `CREATE INDEX CONCURRENTLY` so traffic flows while the index builds.
- Some engines have escape hatches — MySQL 8.0 has a "skip scan" optimization, and recent Postgres versions gained similar tricks — but these fire only under narrow conditions. Treat them as a bonus, never a plan. Write your queries to match the leftmost rule.
- Verify everything with `EXPLAIN` (see [explain](what-is-explain.md)) — the planner decides based on table statistics, and the only way to know what actually happened is to ask.

## 4. See It In Practice — Real Code or Queries

Here's the dashboard scenario from section 1, fixed. Schema and queries below were executed against SQLite; the `EXPLAIN QUERY PLAN` wording differs slightly on Postgres and MySQL but the behavior is the same.

```sql
CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  tenant_id   INTEGER NOT NULL,
  status      TEXT    NOT NULL,
  created_at  TEXT    NOT NULL,
  total_cents INTEGER NOT NULL
);

-- One index for the dashboard shape: equality, equality, range.
-- Column order here is a design decision, not a preference.
CREATE INDEX idx_orders_tenant_status_created
  ON orders (tenant_id, status, created_at);
```

Now watch which query shapes this index serves. Each result below is real output from `EXPLAIN QUERY PLAN` on SQLite:

```sql
-- Shape 1: all three columns -> full seek into the index
SELECT * FROM orders
WHERE tenant_id = 7 AND status = 'shipped' AND created_at > '2026-01-01';
```

```txt
SEARCH orders USING INDEX idx_orders_tenant_status_created (tenant_id=? AND status=? AND created_at>?)
```

```sql
-- Shape 2: leftmost prefix of two -> still a seek
SELECT * FROM orders
WHERE tenant_id = 7 AND status = 'shipped';
```

```txt
SEARCH orders USING INDEX idx_orders_tenant_status_created (tenant_id=? AND status=?)
```

```sql
-- Shape 3: conditions written in shuffled order -> identical plan.
-- The planner matches the column SET, not your typing order.
SELECT * FROM orders
WHERE created_at > '2026-01-01' AND tenant_id = 7 AND status = 'shipped';
```

```txt
SEARCH orders USING INDEX idx_orders_tenant_status_created (tenant_id=? AND status=? AND created_at>?)
```

```sql
-- Shape 4: skips the leading column -> the index is useless,
-- the planner falls back to reading the entire table.
SELECT * FROM orders WHERE status = 'shipped';
```

```txt
SCAN orders
```

Shape 4 is the six-second dashboard all over again: `SCAN` means every one of the 20 million rows gets examined.

Two more behaviors worth seeing. First, a gap in the middle also stops deeper columns from helping:

```sql
-- Shape 5: tenant_id matches, but status (the middle column) is missing,
-- so created_at cannot extend the seek -- only tenant_id drives it.
SELECT * FROM orders
WHERE tenant_id = 7 AND created_at > '2026-01-01';
```

```txt
SEARCH orders USING INDEX idx_orders_tenant_status_created (tenant_id=?)
```

Only `tenant_id=?` appears in the plan — the date gets checked entry by entry within that tenant's slice. Second, notice when the query needs the table at all. If every column the query wants already lives in the index, the database never touches the table — that's called a covering index ([dedicated page here](what-is-covering-index.md)):

```sql
-- Shape 6: status and created_at are IN the index, so no table lookup happens
SELECT status, created_at FROM orders WHERE tenant_id = 7;
```

```txt
SEARCH orders USING COVERING INDEX idx_orders_tenant_status_created (tenant_id=?)
```

And finally the sort trap:

```sql
-- Shape 7: status sits BETWEEN tenant_id and created_at in the index,
-- so within a tenant the rows are sorted by status FIRST -- the planner
-- must collect matches and sort them separately.
SELECT * FROM orders
WHERE tenant_id = 7
ORDER BY created_at DESC
LIMIT 10;
```

```txt
SEARCH orders USING INDEX idx_orders_tenant_status_created (tenant_id=?)
USE TEMP B-TREE FOR ORDER BY
```

If "latest orders per tenant" is a hot query, that index was built in the wrong order for it — `(tenant_id, created_at)` would return the answer already sorted, no temporary sort step. Same columns, different order, different superpower. That's the whole personality of composite indexes.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a composite index, and when would you create one?**

An index built on two or more columns of the same table, stored as one sorted structure keyed by those columns in order. You create one when your queries repeatedly filter on the same *combination* of columns — a tenant scoping plus a status plus a date, say. The signal to look for is a query shape appearing in your slow-query log where a single-column index isn't enough: the first column narrows things somewhat, but the remaining filters still chew through hundreds of thousands of rows. One composite index replaces that whole pattern with a direct seek.

**Q: Does the order of columns in the index matter? Why?**

Completely. The index stores entries sorted by the first column, then the second within ties, then the third — like a phone book sorted by last name then first name. That means `(tenant_id, created_at)` and `(created_at, tenant_id)` are different structures with different abilities: the first serves tenant-only and tenant-plus-date-range queries, the second serves date-only and date-plus-tenant queries. Since `created_at` is nearly unique on its own, an index led by it is nearly as scattered as the raw table for anyone filtering only by tenant. The rule: columns you always filter with equality go first, the column you range over goes last.

**Q: Explain the leftmost prefix rule.**

A composite index can only be used for filters that start at its first column and continue without gaps. From `(a, b, c)` you get efficient service for `a`, `(a, b)`, and `(a, b, c)` — and nothing for `b` or `c` alone, because those values aren't grouped anywhere in the structure; they're spread across every `a` value, like finding all people named Anika in a phone book organized by surname. Two refinements show you really get it: a gap breaks the chain — with `(a, b, c)`, a query on `a` and `c` uses the index only for `a`; and the rule runs in reverse as design advice — since `(a, b)` already serves `a`-only queries, keeping a separate index on `(a)` next to it is pure write overhead with zero benefit.

**Q: My WHERE clause lists columns in a different order than the index. Does it break?**

No. `WHERE created_at > ? AND tenant_id = ? AND status = ?` uses the `(tenant_id, status, created_at)` index exactly as well as the neatly ordered version. The optimizer looks at the set of columns in the predicate and figures out the best access path itself; the textual order is irrelevant. I verified this with EXPLAIN plans — the plans come out identical. The thing that matters is *which* columns appear, not in what sequence they're written.

**Q: Where should the range condition go, and why?**

Last among the indexed columns. Once the database hits a range on a column — `>`, `<`, `BETWEEN`, a LIKE prefix — the remaining candidate entries form a span, and columns after the ranged one are only sorted within each individual value inside that span, not across it. They stop contributing to narrowing the search; the engine can still check them per-entry inside the index, but the scan window was already fixed by the equality columns. So the design order is: equality columns first (most selective grouping first), range column last. Concretely, for "shipped orders for tenant 7 since January," the index `(tenant_id, status, created_at)` lets the engine jump straight to the exact starting entry and stream forward.

**Q: Can't I just create a single-column index on each filtered column instead?**

This is the classic mistake, and it fails because separate indexes don't stack into one seek. The engine picks one of them — usually the most selective — seeks into it, and then applies every other filter row by row over the matches. MySQL does have an "index merge" trick and Postgres can bitmap-AND multiple indexes, and yes, sometimes those rescue such a query, but they're far less efficient than a purpose-built composite index, they're fragile (planner statistics decide when they fire), and nobody should design a schema hoping an optimizer bailout saves them. One composite index matching the query shape beats several singles every time.

**Q: When can adding a composite index actually hurt?**

Three ways. First, write amplification: every insert, delete, and update of indexed columns must maintain the index, so a hot-write table with many indexes slows down measurably — this is the main reason you don't index defensively "just in case." Second, redundancy: an `(a, b)` index already serves `a`-only lookups, so leaving the old `(a)` index in place doubles the write cost for zero read benefit — drop it after verifying no query hints depend on it. Third, migration risk: building an index locks writes on some engines, and on a large table the build itself takes long enough to matter — on Postgres you use `CREATE INDEX CONCURRENTLY`, accepting that it's slower to build but never blocks traffic. There's a fuller treatment of when indexes backfire in [when-can-indexes-hurt-performance](when-can-indexes-hurt-performance.md).

**Q: How do you verify an index is actually being used?**

EXPLAIN, then EXPLAIN ANALYZE when you want truth rather than intention ([details](what-is-explain-analyze.md)). Plain EXPLAIN shows the planned access path — you want to see a seek or index scan naming your index, not a full table scan. EXPLAIN ANALYZE actually executes the query and reports real timings and row counts, which catches the nastier cases: the planner picked your index but scanned almost as many entries as the table, meaning the column order didn't discriminate the way you assumed. In production I'd also watch for regressions after data growth or statistics refreshes — plans can change under you, which is why slow-query monitoring beats one-time verification.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Filtering on the second column only.** The assumption: "the index contains `status`, so querying by status will use it." Wrong because the index's entries are sorted by `tenant_id` first — matching `status` values are scattered across every tenant's slice of the tree, so there is no contiguous region to seek into. What actually happens: the planner abandons the index and runs a full table scan, exactly what we saw in shape 4 above — `SCAN orders`. On 20 million rows, that's your incident. The fix: either create an index whose leading column is the one this query actually filters on, or reshape the query to include a leading column (multi-tenant apps usually have `tenant_id` available everywhere, so lead with it).

**Trap 2: Putting the range column first.** The assumption: "`created_at` is the most selective column, so it should lead." But for the dashboard query, a date range produces a huge span, and `status` values within that span are unordered — the engine can't use `status` to narrow anything. What actually happens: the index degrades into "date-range scan, then filter status per row," which loses most of the win whenever the date range is wide. The fix: equality columns first, range last — `(tenant_id, status, created_at)`. Selectivity of a lone column matters less than the *shape* the whole query forces.

**Trap 3: Reordering the WHERE clause to "fix" performance.** The assumption: the planner reads predicates left to right and needs them to match the index order. False — planners analyze the predicate set and choose the access path themselves. What actually happens: nothing changes, good or bad; engineers burn review cycles shuffling SQL that was already fine, while the real problem (missing or misordered index) hides elsewhere. The fix: stop editing clause order, run EXPLAIN, and act on the actual plan.

**Trap 4: Redundant overlapping indexes.** The assumption: each index serves distinct queries, so more is safer. Not when one is a prefix of another — `(tenant_id)` is fully covered by `(tenant_id, status, created_at)` for any `tenant_id`-only query. What actually happens: every write maintains both structures forever, doubling that portion of write cost and storage, while reads never get faster than the composite alone. The fix: audit with a tool like PostgreSQL's `pg_stat_user_indexes` (or MySQL's unused-index views), confirm the shorter index earns no reads, drop it.

**Trap 5: Wrapping the indexed column in a function or mismatching types.** The assumption: `WHERE DATE(created_at) = '2026-08-25'` can still use the index on `created_at`, since the column is right there. But the index stores raw values, and the predicate applies a transformation to every one of them — the planner generally cannot walk the tree for a computed value. Same story with type mismatches, like comparing a string column to a number. What actually happens: full scan despite the perfectly good index. The fix: express the predicate against the bare column with a sargable range — `WHERE created_at >= '2026-08-25' AND created_at < '2026-08-26'` — and cast literals to the column's type, not the other way around.

**Trap 6: Expecting the index to deliver sorted output when a middle column interrupts.** The assumption: "my index ends with `created_at`, so `ORDER BY created_at` is free." Only if every earlier column is pinned by equality. With `(tenant_id, status, created_at)` and a filter on `tenant_id` alone, rows within a tenant are ordered by status first, so the requested order isn't there — shape 7 showed the planner resorting to a temporary sort. What actually happens: correct results, but the database collects and sorts the whole matching set before applying `LIMIT 10`, which hurts precisely on hot paths like "show me the newest N rows." The fix: if a sorted hot query matters, build the index for it — `(tenant_id, created_at)` returns those rows pre-sorted.

## 7. Compare With Related Concepts

**Composite index vs single-column index.** A single-column index is one sorted list for one column; a composite index is one sorted list keyed by several columns in sequence, which is why it can serve combinations and prefixes while a single-column index can serve only its own column. The difference in practice: with filters on `tenant_id` and `status`, a `tenant_id` index leaves the engine filtering status row by row, while `(tenant_id, status)` seeks straight to the pair. Rule of thumb: single-column index when queries reliably filter on that one column alone; composite when the same leading column recurs with varying companions.

**Composite index vs covering index.** These describe different dimensions, and people conflate them constantly. "Composite" describes the index's *key* — multiple columns, ordered. "Covering" describes a *relationship between an index and a particular query* — the index happens to contain every column that query touches, so the table never gets visited (shape 6 above showed SQLite literally announcing `COVERING INDEX`). Any index, single or composite, can be covering for a lucky slim query; composite indexes become covering more often simply because they carry more columns. Rule of thumb: choose column order to *seek* well; if a hot query then finds all its columns in the index, covering is the bonus. More in [what-is-a-covering-index](what-is-covering-index.md).

**Composite index vs clustered index.** Again orthogonal. "Composite" counts the key columns; "clustered" describes where the actual row data lives — a clustered index *is* the table, sorted; a composite secondary index is a pointer-carrying copy beside it. You can have a composite clustered index (many composite primary keys end up that way in MySQL/InnoDB) or a single-column non-clustered one. Rule of thumb: decide clustering by how you want the table physically laid out; decide compositeness by your query shapes. Background in [what-is-a-clustered-index](what-is-a-clustered-index.md).

## 8. 🧠 The Memory Hook

A composite index is a phone book sorted by last name, then first name: pin the sections from the front and you land on your row instantly — but skip the leading column and you're hunting every "Anika" in the city, page by page. Equality pins, ranges open a door but close the rest of the key, and column order is the whole design decision.
