# What is B-tree index

## 1. The Real-World Problem — When You Actually Hit This

It's Monday morning. Your support team opens the admin dashboard, searches for a customer's recent orders, and the spinner hangs for nine seconds. You pull up the query:

```sql
SELECT * FROM orders
WHERE customer_id = 48213
ORDER BY created_at DESC
LIMIT 20;
```

In development this was instant. Back then the `orders` table had five thousand rows. Now it has forty million, and PostgreSQL is reading *all* of them — checking every single row against `customer_id`, keeping the matches, then sorting them by date just to throw away all but twenty. Forty million rows touched, twenty returned. That gap between "rows scanned" and "rows returned" is the entire reason indexes exist, and the B-tree is the index PostgreSQL reaches for by default when you don't ask for anything else. If you've ever run `CREATE INDEX` and wondered what actually got built and why it made the query 500x faster, this page is that explanation.

## 2. The Analogy — Make the Mechanic Obvious

Think of a huge filing office that stores paper documents in numbered boxes. Millions of boxes. Nobody memorizes where anything is — instead there's a card-based lookup system built on top of the boxes:

At the entrance there's **one master directory card**. It doesn't tell you where any document is. It only splits the key space: "customer IDs from 1 to 10 million, follow the left corridor. IDs above 10 million, right corridor."

Walk down the correct corridor and you find **divider cards**, each narrowing things further: "IDs 40,000,000–45,000,000 are in aisle 7." Inside the aisle, more dividers: "IDs 48,000–49,000 are in cabinet 3."

Finally you reach a **folder of sorted cards** — one card per document, arranged alphabetically or numerically, and each card carries two things: the key itself (the customer ID) and a physical location written on it ("box 8812, third item"). You flip to ID 48213, read "box 8812", walk over, grab the actual document. Total walking: a handful of steps, no matter that the warehouse holds millions of boxes.

Now map it: the master directory card is the **root page**, the corridor and aisle dividers are **internal pages**, the folders of sorted cards with locations written on them are **leaf pages**, and "box 8812" is the pointer to where the real row sits in the table file. Every lookup follows the same top-to-bottom path, every level halves-or-better narrows your search, and because the cards in the folder are already sorted, anything that needs "in order" — newest first, cheapest first, a date range — falls out for free.

One more detail the analogy gets right: when someone adds a new document, they don't reshuffle the warehouse. They slip one sorted card into a folder. Only when a folder physically fills up does it split into two folders and the divider above gets updated. That's what keeps inserts cheap.

## 3. The Full Explanation — How It Actually Works

In plain words first: a B-tree is a **multi-level sorted lookup structure**. It stores copies of a column's values in sorted order, organized as a short tree of pages, and each entry eventually points to the exact place in the table where the full row lives. That one sentence contains everything — let's unpack it.

**The shape.** PostgreSQL stores everything on disk in fixed-size pages (8 KB each). A B-tree index is just a chain of these pages arranged in levels. At the top is a single **root page**. In the middle are **internal pages**, whose only job is routing: each holds a small sorted list of keys and tells you which child page to descend into for values below, between, or above them. At the bottom sit the **leaf pages**, and these are where the money is: every leaf entry holds the indexed value plus a **pointer to the table row** — PostgreSQL identifies rows by their physical address, called the `ctid` (a page number plus slot number in the table file). So "find the row" literally means "find the leaf entry, read its ctid, fetch that page from the table."

**Why it stays fast forever.** This is the part people underestimate. Each page holds hundreds of keys, and each level multiplies how many keys the level below can cover. Three levels covers roughly hundreds × hundreds × hundreds ≈ tens of millions of entries; four levels covers billions. So even a 100-million-row table usually has an index that's **three or four levels deep** — meaning any point lookup reads 3–4 index pages plus 1 table page. That's why adding a B-tree turns a scan of millions of rows into a handful of page reads, and why the speedup barely degrades as the table grows. The tree grows *wide*, not tall. (The math: coverage grows exponentially with height — O(log n) lookups.)

**Why sorted order matters so much.** Because the leaf pages form one long sorted chain, the index doesn't just answer "where is this exact value?" It also answers:

- Equality: `WHERE email = '...'` — descend straight to the leaf.
- Range: `WHERE created_at BETWEEN x AND y` — find the start, then walk the leaf chain rightward until you pass the end. Everything between is contiguous.
- Comparison: `<`, `>`, `<=`, `>=`, `IN` — same story.
- Sorting: `ORDER BY created_at DESC` — the rows come off the leaves already in order, so PostgreSQL skips the sort step entirely.
- Left-anchored prefix search: `LIKE 'abc%'` — searching for everything starting with "abc" is just a range scan from "abc" to "abd". But `LIKE '%abc'` is hopeless here, and we'll see why in the traps.

This is why the B-tree is the **default index type**: most queries in real applications are equality filters, range filters, and sorts on scalar columns — exactly what a sorted structure is good at.

**What you pay for it.** An index is a second copy of the data, kept permanently in sync. Every `INSERT` must update every index on the table. Every `UPDATE` on an indexed column is worse than it sounds under PostgreSQL's MVCC model — the update creates a brand-new row version, which means a brand-new leaf entry, while the old entry lingers until vacuum cleans it up. More indexes also mean more work for autovacuum, more disk space, and occasionally a slower plan because the planner's choices multiply. The trade is simple: you spend write time and disk to buy read time. For read-heavy tables that's the best deal in databases. For a write-heavy append-only log with no selective reads, five B-trees are pure tax.

**When a sorted structure isn't enough.** Sorting gives you ordering — and some questions have nothing to do with order. "Which documents contain this word?" "Which rows have an array containing 42?" "Which shapes overlap this rectangle?" Those aren't range questions, so a B-tree can't help. That's what the other index types are for, and PostgreSQL ships several: GIN for containment and full-text, GiST for ranges-over-shapes and nearest-neighbor, Hash for pure equality. Section 7 compares them, and the repo has dedicated pages for the [GIN index](what-is-gin-index.md) and [GiST index](what-is-gist-index.md).

**How the planner fits in.** Having an index doesn't force PostgreSQL to use it. The query planner estimates costs — how many rows match, how random the I/O would be — and sometimes decides a sequential scan is genuinely cheaper, like when your filter matches half the table. To see what actually happened, run the query through [EXPLAIN ANALYZE](what-is-explain-analyze.md) and look for `Index Scan using <your_index>` versus `Seq Scan`.

## 4. See It In Practice — Real Code or Queries

Back to the slow dashboard query. Here's the fix, end to end:

```sql
-- The table, roughly:
--   orders(id bigserial PRIMARY KEY, customer_id bigint NOT NULL,
--          created_at timestamptz NOT NULL, total_cents int, status text)

-- Plain CREATE INDEX builds a B-tree — it's the default, no USING needed:
CREATE INDEX idx_orders_customer_id ON orders (customer_id);

-- But the query ALSO sorts by date. A composite index handles both:
-- equality column first, sort column second. Now the matching rows
-- come off the leaves already ordered newest-first, so the
-- ORDER BY ... LIMIT 20 stops touching anything beyond 20 rows.
CREATE INDEX idx_orders_customer_created
    ON orders (customer_id, created_at DESC);

-- Same thing written out explicitly, to prove what it is:
CREATE INDEX idx_orders_customer_created_explicit
    ON orders USING btree (customer_id, created_at DESC);

-- Verify the plan before and after:
EXPLAIN ANALYZE
SELECT * FROM orders
WHERE customer_id = 48213
ORDER BY created_at DESC
LIMIT 20;

-- Without the composite index you'd see something like:
--   Sort  (cost=... rows=412)
--     Sort Key: created_at DESC
--     ->  Index Scan using idx_orders_customer_id on orders
--
-- With it, the sort disappears completely:
--   Limit  (cost=0.56..18.23 rows=20)
--     ->  Index Scan using idx_orders_customer_created on orders
--         Index Cond: (customer_id = 48213)
```

A few everyday variations worth knowing cold:

```sql
-- Range queries ride the same structure — one seek, then walk the leaves:
CREATE INDEX idx_orders_created_at ON orders (created_at);
SELECT count(*) FROM orders
WHERE created_at >= now() - interval '30 days';

-- Left-anchored prefix search works, because 'jo%' is secretly a range:
SELECT * FROM users WHERE email LIKE 'jo%';
-- NOTE: on a non-C collation database, plain btree may refuse LIKE.
-- Create it with the pattern operator class if you rely on this:
CREATE INDEX idx_users_email_pattern ON users (email text_pattern_ops);

-- Function-wrapped columns need an expression index (see the traps):
CREATE INDEX idx_users_email_lower ON users (lower(email));
SELECT * FROM users WHERE lower(email) = 'ana@example.com';

-- Partial index: index only the rows you actually query.
-- Great for status-style filters that match a small slice:
CREATE INDEX idx_orders_pending
    ON orders (created_at)
    WHERE status = 'pending';
```

That last one combines with [partial indexes](what-is-partial-index.md), and the `lower(email)` trick is the subject of [expression indexes](what-is-expression-index.md) — both build directly on this page.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a B-tree index and why is it PostgreSQL's default?**

A B-tree is a multi-level sorted structure kept alongside the table: it stores the indexed column's values in sorted order across three kinds of pages — a root page, internal routing pages, and leaf pages that hold each key plus a pointer to the physical row. A lookup descends from the root, following keys that bracket the target, and lands on the leaf in a few page reads. It's the default because the overwhelming majority of real queries filter or sort on scalar columns with `=`, `<`, `>`, `BETWEEN`, or `ORDER BY` — and sorted order serves every one of those. Other index types exist for the cases sorting can't serve (containment, full-text, geometry), but those are special-purpose; B-tree is the general-purpose workhorse.

**Q: Why does a B-tree stay fast even on a table with billions of rows?**

Because the tree's height grows logarithmically, not linearly. Each page holds hundreds of keys, and each level down multiplies capacity by another few hundred. Three levels covers tens of millions of entries; four covers billions. So a lookup costs the same handful of page reads whether the table has a million rows or a billion — the extra data widens the tree, it doesn't deepen it much. Contrast that with a sequential scan, which scales strictly linearly: double the rows, double the time. That asymptotic difference is the whole selling point.

**Q: Which operators can use a B-tree, and which cannot?**

B-tree supports anything defined by sorted order: `=`, `<`, `<=`, `>`, `>=`, `BETWEEN`, `IN`, `IS NULL` / `IS NOT NULL`, `ORDER BY` on the indexed column(s), and left-anchored `LIKE 'prefix%'` (with the caveat that non-C collations need the `text_pattern_ops` operator class for the pattern variants). It cannot serve `LIKE '%substring%'` — there's no prefix to seek to — nor similarity/trigram matching, array containment, JSONB key lookups, or geometric overlap. Those need GIN or GiST instead.

**Q: Your table has an index on the filtered column, yet EXPLAIN shows a Seq Scan. Why would PostgreSQL ignore your index?**

Usually one of three reasons, and none of them is a bug. First, selectivity: if the filter matches a large fraction of the table — say 30% of ten million rows — walking the index and fetching thousands of scattered pages costs more than one clean sequential pass over the file, and the planner knows it. Second, type mismatch: filtering `numeric_col = '123'` or wrapping the column in a function breaks the index condition (more on that below). Third, tiny tables: for a few hundred rows, a seq scan of a couple of pages is faster than any index round-trip. The habit to build is: never argue about plans from intuition — run `EXPLAIN ANALYZE` and read what the executor actually did.

**Q: What does an index cost you? When should you not add one?**

Every index is a second sorted copy maintained on every write. Inserts pay it always; updates pay it whenever an indexed column changes — and under PostgreSQL's MVCC, updating an indexed column creates a new row version and thus a new index entry, with the old one lingering for vacuum. So indexes cost write throughput, disk, and vacuum pressure. Don't add one when the column is rarely filtered on, when selectivity is so low the planner would skip it anyway (a boolean, a three-value status), or on hot append-only write paths nobody queries selectively. And review your existing indexes periodically — dead indexes are invisible weight.

**Q: You create a composite index on (created_at, customer_id) but a query filtering by customer_id alone doesn't use it. Why?**

Column order is the contract. A B-tree sorts by the first column, then by the second within equal firsts — like a phone book sorted by surname then first name. Knowing only the first name doesn't let you seek. With `(created_at, customer_id)`, the entries are grouped by date, so `customer_id = X` values are scattered everywhere; the planner would have to read the whole index. Swap it to `(customer_id, created_at)` and both the filter and the sort become seekable. The working rules: equality columns first, the range or sort column last, and an index on `(a, b)` also serves queries filtering on `a` alone — but not on `b` alone.

**Q: How does a B-tree interact with ORDER BY and pagination?**

If the index's column list matches the sort's — including direction, e.g. `created_at DESC` — the planner reads the leaves in order and skips the sort node entirely. Combined with `LIMIT`, this is dramatic: `ORDER BY created_at DESC LIMIT 20` reads exactly 20 index entries instead of fetching and sorting every matching row. This is the standard mechanism behind keyset pagination: `WHERE (created_at, id) < ($last_seen_created, $last_seen_id) ORDER BY created_at DESC, id DESC LIMIT 20` rides a matching composite index and stays fast on page 10,000, unlike OFFSET which re-reads and discards everything before the page.

## 6. The Traps — What Goes Wrong in Production

**The leading wildcard.** The wrong assumption: "there's an index on `name`, so my search `LIKE '%son'` will use it." Why it's wrong: a B-tree seeks by comparing prefixes — it finds where "son..." would *start*. `'%'` at the front destroys the starting point; the matching strings live scattered across the whole sorted range, so no seek position exists. What happens: the planner falls back to a sequential scan, the query quietly degrades from milliseconds to seconds as the table grows, and nobody notices until a customer complains. The fix: if you truly need substring search, that's a different index type — enable `pg_trgm` and build a GIN trigram index (`CREATE INDEX ON users USING gin (name gin_trgm_ops)`), which handles `%anything%`. Or, if business allows it, anchor the search to the left. See the [GIN index](what-is-gin-index.md) page for that path.

**The function-wrapped column.** The wrong assumption: "the query filters on `email`, and `email` has an index, so `WHERE lower(email) = $1` uses it." Why it's wrong: the index stores raw `email` values sorted as-is — `'Ana@Example.com'` sorts differently than `'ana@example.com'`, so the planner cannot seek inside the index with a transformed value. What happens: full sequential scan, again. The fix: either normalize on write so the column already holds lowercase values, or create an **expression index** — `CREATE INDEX ON users (lower(email))` — which indexes the function's output and matches the transformed predicate exactly. Same trap in disguise: implicit casts (`varchar_col = 42`) and mutating wrappers like `WHERE created_at::date = '2026-08-25'` (use a half-open range `>= timestamp AND < timestamp + 1 day` instead, which the plain index loves). Details in [expression indexes](what-is-expression-index.md).

**Indexing the wrong column order in composites.** The wrong assumption: "an index containing both columns helps any query touching either." Why it's wrong: the sort hierarchy starts at the leading column, so trailing columns are only reachable once the leading one is pinned. What happens: queries filtering only on the trailing column ignore the index, and someone concludes "indexes don't work on this table" and adds a duplicate index with the opposite order — doubling write cost. The fix: order composite indexes as equality-first, range/sort-last, and audit with `EXPLAIN` before assuming.

**Indexing everything "just in case".** The wrong assumption: "indexes are free wins for reads." Why it's wrong: each one is maintained synchronously on every write, and MVCC turns indexed-column updates into fresh index entries. What happens: an INSERT-heavy table with six B-trees shows mysteriously poor write throughput, bloated index sizes, and an autovacuum daemon working overtime — with no single smoking gun. The fix: treat indexes like any other performance investment — measure with real query patterns ([slow query optimization](how-do-you-optimize-slow-postgresql-queries.md)), drop unused ones (`pg_stat_user_indexes` shows `idx_scan` counts), and prefer fewer composite indexes over many single-column ones.

## 7. Compare With Related Concepts

These four get conflated constantly in interviews, and the fastest way to keep them apart is to ask "is the question about order?"

**B-tree vs GIN.** B-tree answers order-based questions (equal, range, sort); GIN is an inverted index — it maps *element* to *rows containing it*, built for containment: arrays (`@>`), JSONB keys/values, full-text vectors, and trigram substring search. Rule: scalar comparisons and sorting → B-tree; "does it contain/match?" → GIN. Full mechanics in [what-is-gin-index](what-is-gin-index.md).

**B-tree vs GiST.** GiST is a generalized balanced tree for values that don't have a single sortable line — geometric shapes, ranges, network types — supporting overlap (`&&`), containment, and nearest-neighbor (`<->`). Rule: numbers, dates, strings compared with `<`/`=` → B-tree; "do these ranges/shapes intersect?" or KNN → GiST. Note that ordinary scalar ranges like `int4range` can actually use either — B-tree for pure ordering, GiST for overlap. Details in [what-is-gist-index](what-is-gist-index.md).

**B-tree vs Hash.** Hash indexes (production-safe since PostgreSQL 10) serve exactly one operator: `=`. They can't do ranges or sorting, and historically had reliability baggage. Rule: equality-only lookups *can* use Hash, but B-tree does equality almost as well *plus* everything else — so the honest interview answer is that Hash is rarely the right default choice; reach for it only with a measured reason.

**B-tree vs expression / partial indexes.** Not different tree types — different *keys* and different *row subsets*, both still built as B-trees underneath. Expression indexes index a computed value (`lower(email)`); partial indexes index only rows matching a `WHERE` clause. Rules: predicate transforms the column → expression index; predicate pins a rare slice (`status = 'pending'`) → partial index.

## 8. 🧠 The Memory Hook

A B-tree is a phone book that never gets taller than a few tabs no matter how many names you add — perfect when you know how the name *starts*, useless when you only remember it *ends* with "-son". Sorted pages, short tree: that's the whole trick.
