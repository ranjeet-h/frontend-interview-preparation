# What is composite index in MySQL

## 1. The Real-World Problem — When You Actually Hit This

Your app has an `orders` table with two million rows. You add an index on `customer_id` and another index on `status`. Both queries fly on their own. Then you ship this:

```sql
SELECT * FROM orders WHERE customer_id = 42 AND status = 'shipped';
```

And it still does a full scan or crawls. In MySQL `EXPLAIN` you see `rows: 800k` even though only 50 rows actually match both conditions. Each single-column index narrows the result a little, but neither one narrows it to exactly what you asked for. MySQL has to pick one index, fetch a bunch of rows, and filter the rest — or try to stitch two indexes together at runtime, which is extra work.

This is the moment composite indexes exist for. When your `WHERE`, `ORDER BY`, or `JOIN` regularly filters on two or three columns *together*, you want one index that is sorted by all of those columns together, so MySQL can jump straight to the exact slice you need.

## 2. The Analogy — Make the Mechanic Obvious

Think of a phone book sorted by last name, then first name.

That is a composite index on `(last_name, first_name)`. The book is not sorted by first name alone. It is sorted by last name first, and only within the same last name is it sorted by first name.

That single ordering rule explains everything:

- If you search for `last_name = 'Patel'` — easy, you flip to the Patel section. That uses the composite index, because you gave the leading column.
- If you search for `last_name = 'Patel' AND first_name = 'Asha'` — even faster, you go to Patel, then to Asha inside Patel. That is the perfect use of the composite index.
- If you search for `first_name = 'Asha'` with no last name — the book cannot help you. Ashas are scattered across every last-name section. You would have to scan the whole book. A composite index on `(last_name, first_name)` does not help a query that only filters on `first_name`.

Column order is the same. `(last_name, first_name)` and `(first_name, last_name)` are two completely different phone books. Pick the order based on how you actually search.

## 3. The Full Explanation — How It Actually Works

A composite index — also called a compound or multi-column index — is a single B+Tree index built on two or more columns. In InnoDB, that B+Tree is sorted lexicographically: first by the leftmost column, then by the next column for ties, then the next, and so on. The leaf entries point to the primary key, which then points to the row.

Because it is one sorted structure, MySQL can do a single range scan to satisfy a multi-column predicate. That is cheaper than chasing two separate trees and intersecting the results.

There are four things you need to understand cold.

**Leftmost prefix — the only rule that matters.** An index on `(a, b, c)` can be used for queries that filter on `a`, on `a AND b`, or on `a AND b AND c`. It cannot be used efficiently for `b` alone, `c` alone, or `b AND c` without `a`. MySQL reads the index from the left. If you skip the left side, it cannot navigate the tree.

It also matters for partial use. `WHERE a = 10 AND c = 5` can use the index for `a`, but not for `c`, because `b` is missing in the middle and breaks the sorting chain. MySQL will filter `c` after fetching.

**Column order decides whether the index gets used at all.** Put the most selective and most commonly filtered columns first, but with a nuance: columns used with `=` (equality) should come before columns used with ranges or sorting. A good rule of thumb:

- Equality columns first — `WHERE status = 'shipped' AND created_at > '2025-01-01'` wants `(status, created_at)`, not the reverse, because MySQL can jump to the `shipped` section and then do a range scan on `created_at` inside it.
- High cardinality alone does not win. If you almost always filter by `customer_id` and sometimes also by `status`, put `customer_id` first even if `status` has low cardinality, because `WHERE customer_id = ?` must be able to use the index alone.
- If you need to support both `WHERE a = ?` and `WHERE a = ? AND b = ?`, a single `(a, b)` index covers both. You do not need a separate index on `(a)`.

**Where it helps beyond WHERE.** A composite index can also satisfy `ORDER BY` and `GROUP BY` without a filesort if the order matches the index order. `ORDER BY last_name, first_name` can be served by `(last_name, first_name)`, but `ORDER BY first_name` cannot. Same for `ORDER BY last_name DESC, first_name ASC` — direction matters in MySQL 8, which supports descending indexes.

And it can become a covering index. If the index contains every column your query needs, InnoDB never touches the table at all. `SELECT customer_id, status FROM orders WHERE customer_id = 42 AND status = 'shipped'` with an index on `(customer_id, status)` is covered — MySQL reads only the index. `EXPLAIN` shows `Using index` for that.

**Index merge vs composite — MySQL's fallback.** If you have separate indexes on `customer_id` and `status`, MySQL can sometimes do an index merge: scan both indexes, intersect the row IDs, then fetch rows. It works, and `EXPLAIN` will say `Using intersect(...)`. But it is slower than a single composite lookup. You are reading two trees, building two sets, intersecting them, and then doing random lookups. A composite index does one tree walk and one lookup path. MySQL's optimizer may also just pick one of the two indexes and filter the other column row by row, which is even worse.

So the rule is simple: if you routinely filter on columns together with `AND`, give MySQL one composite index for that combination instead of hoping it merges two singles.

**The cost.** A composite index is not free. Every `INSERT`, `UPDATE`, and `DELETE` that touches those columns must update the index. It takes disk space — a wide index on three `VARCHAR(255)` columns hurts. And a bad composite index that nobody uses just slows writes for nothing. Create them for query patterns you actually have, verified by `EXPLAIN` and slow-query logs.

## 4. See It In Practice — Real Code or Queries

All examples are MySQL / InnoDB. Run them in MySQL 8.

```sql
-- A table with two million orders (simplified)
CREATE TABLE orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  customer_id BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL,
  created_at DATETIME NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  INDEX idx_customer_status_created (customer_id, status, created_at)
  -- composite index: customer_id first, then status, then created_at
) ENGINE=InnoDB;

-- The composite index definition on its own looks like this:
CREATE INDEX idx_customer_status ON orders (customer_id, status);

-- Check how MySQL will actually use it
EXPLAIN SELECT * FROM orders
WHERE customer_id = 42 AND status = 'shipped';
-- type: ref, key: idx_customer_status, rows: ~50  (one precise B+Tree range)

-- Leftmost prefix in action: these use the index
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
-- uses idx_customer_status (leftmost column alone is enough)

EXPLAIN SELECT * FROM orders
WHERE customer_id = 42 AND status = 'shipped' AND created_at > '2025-01-01';
-- uses idx_customer_status_created for customer_id + status, range on created_at

-- This does NOT use the composite index efficiently
EXPLAIN SELECT * FROM orders WHERE status = 'shipped';
-- type: ALL or different index — leading column customer_id is missing
-- MySQL cannot navigate a (customer_id, status) tree by status alone

-- Fix it only if you actually query by status alone — add a separate index
CREATE INDEX idx_status ON orders (status);

-- Range query stops the chain: index used up to the range column
EXPLAIN SELECT * FROM orders
WHERE customer_id = 42 AND created_at > '2025-01-01' AND status = 'shipped';
-- MySQL may use customer_id, then has to filter the rest
-- Better order: (customer_id, status, created_at) — equalities before range

-- Covering index — MySQL never reads the table
EXPLAIN SELECT customer_id, status FROM orders
WHERE customer_id = 42 AND status = 'shipped';
-- Extra: Using index  (everything came from the index itself)

-- ORDER BY that matches the index — no filesort
EXPLAIN SELECT * FROM orders
WHERE customer_id = 42 ORDER BY status, created_at;
-- Extra: Using index condition  (no Using filesort)

-- ORDER BY that does NOT match — needs a sort or different index
EXPLAIN SELECT * FROM orders ORDER BY status;
-- Extra: Using filesort  (cannot use (customer_id, status) without customer_id)
```

A quick way to think about what extra `EXPLAIN` values mean: `Using index condition` means MySQL is pushing part of the WHERE into the index scan (good). `Using where` plus `Using index` together with no table lookup means covered (great). `Using filesort` means the ORDER BY was not satisfied by the index. `Using intersect` means an index merge happened — it worked, but a proper composite would have been faster.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a composite index in MySQL?**

It is a single index built on two or more columns, stored as one B+Tree sorted by those columns left to right. Instead of having one index on `customer_id` and another on `status`, you have one index on `(customer_id, status)` that lets MySQL find rows matching both conditions in a single tree walk. You create it with `CREATE INDEX idx_name ON table (col1, col2)` and you design it around the actual WHERE and ORDER BY patterns your app uses together.

**Q: What is the leftmost prefix rule?**

MySQL can only use a composite index from the left without gaps. An index on `(a, b, c)` can serve queries on `a`, `a AND b`, and `a AND b AND c`. It cannot serve `b` alone, `c` alone, or `b AND c` without `a`, and if you skip `b` and filter on `a AND c`, only `a` uses the index and `c` becomes a post-filter. This is a direct consequence of how the B+Tree is sorted — without the left column you have no entry point into the right columns.

**Q: If I have an index on (a, b), will a query that filters only on b use it?**

No, not efficiently. MySQL would have to scan the entire index because `b` values are scattered inside each `a` group. It will usually choose a full table scan or a different index instead. If you genuinely need to query by `b` alone, you need a separate index on `(b)` or `(b, something_else)`. The exception in MySQL 8 is index skip scan, where the optimizer can sometimes still use `(a, b)` for a `b`-only query if `a` has very few distinct values — but you should not rely on it. Design for the common case.

**Q: How do you decide the column order in a composite index?**

Three signals. First, equality before range — columns filtered with `=` go before columns filtered with `>`, `<`, `BETWEEN`, or `LIKE 'prefix%'`. Second, the leftmost column should be the one your queries almost always include, because without it the rest of the index is invisible. Third, consider sort coverage — if you always do `WHERE customer_id = ? ORDER BY created_at`, then `(customer_id, created_at)` lets you avoid a filesort. Do not blindly put the highest cardinality column first if it is rarely in the WHERE clause. Always verify with `EXPLAIN` and the slow query log, not gut feeling.

**Q: What is the difference between a composite index and having two separate single-column indexes? What is index merge?**

Two single-column indexes are two separate trees. A composite index is one tree sorted by both columns. When you filter on both columns with separate indexes, MySQL has two options: pick one index and filter the other column row by row, or do an index merge — scan both indexes, intersect the matching row IDs, then fetch rows. Index merge works but costs two index scans plus an intersection plus random lookups. A composite index does one scan on one tree. That is why `WHERE a = ? AND b = ?` should have an index on `(a, b)` if that query is frequent. Separate indexes are better when you filter on `a` alone in some queries and `b` alone in others with no overlap.

**Q: What is a covering index and how does a composite index help?**

A covering index is one that contains every column the query needs, so MySQL can answer the query without reading the table. A composite index naturally becomes covering when your SELECT and WHERE use only columns in the index. `SELECT customer_id, status FROM orders WHERE customer_id = 42 AND status = 'shipped'` with an index on `(customer_id, status)` is covered and shows `Using index` in EXPLAIN. This is the fastest possible access path because there are zero table lookups. For wider queries, you can add included columns to the index to make it covering — but keep it lean, because every extra column costs write performance and space.

**Q: Can a composite index be used for ORDER BY or GROUP BY?**

Yes, if the ORDER BY matches the index order left to right and the WHERE already fixes the prefix. `WHERE customer_id = 42 ORDER BY status, created_at` can be satisfied by `(customer_id, status, created_at)` with no filesort. But `ORDER BY status` alone cannot use `(customer_id, status)`, and `ORDER BY customer_id, created_at` cannot use `(customer_id, status, created_at)` efficiently because `status` is missing in the middle. In MySQL 8, direction matters too — `ORDER BY customer_id ASC, created_at DESC` needs an index defined as `(customer_id ASC, created_at DESC)` to avoid a sort.

## 6. The Traps — What Goes Wrong in Production

**Querying without the leading column and wondering why the index is ignored.** This is the most common mistake. You build `(customer_id, status)` and then write `WHERE status = 'shipped'` and are surprised that `EXPLAIN` shows a full scan. MySQL cannot use the composite without `customer_id`. Fix: check what your WHERE clause actually provides, and add a separate index on `(status)` if that query pattern is real. Do not add `(status, customer_id)` as a blind mirror — only if you actually query by `status` alone or by `status AND customer_id` without needing `customer_id`-only queries.

**Putting a range column too early and killing the rest of the index.** An index on `(created_at, customer_id)` is almost useless for `WHERE customer_id = 42 AND created_at > '2025-01-01'` if most of the filtering power is on `customer_id`. Worse, a range on the first column means the second column cannot be used for further index navigation — MySQL scans a wide range on `created_at` and then filters `customer_id` inside it. Fix: put equality columns first — `(customer_id, created_at)` — so MySQL jumps to the right customer and then does a tight range on the date.

**Wrapping an indexed column in a function.** `WHERE YEAR(created_at) = 2025` will not use an index on `(customer_id, created_at)` for the `created_at` part, because the function hides the column value from the B+Tree comparison. Fix: write it as a range — `WHERE created_at >= '2025-01-01' AND created_at < '2026-01-01'` — so the index can be range-scanned.

**Assuming low-cardinality leading columns are always bad.** People avoid putting `status` first because it has few values. But if every query includes `status = 'shipped'`, having `status` first is fine — it narrows to one partition and everything after it is sorted. The real trap is putting a low-cardinality column first when many queries do not filter on it at all. Then every query that omits it cannot use the index. Fix: lead with the column that appears in most WHERE clauses that should use this index.

**Creating too many overlapping indexes.** You see `(customer_id)`, `(customer_id, status)`, and `(customer_id, status, created_at)` all on the same table. The first one is redundant — `(customer_id, status)` already serves any query that needs `(customer_id)` alone. Every extra index slows down writes and confuses the optimizer, which may pick the wrong one. Fix: audit with `sys.schema_unused_indexes` or check `EXPLAIN` across your real query workload, and drop indexes that are strict prefixes of a composite you already have.

**Expecting the optimizer to always merge two singles efficiently.** It sometimes does, but index merge has limits — it does not work well with ranges on both indexes, it costs extra intersections, and it can be disabled or deprioritized by the optimizer. If you see `Using intersect` in `EXPLAIN` and the row estimate is still high, that is a signal you need a composite instead of two singles.

## 7. Compare With Related Concepts

**Composite index vs single-column index.** A single-column index is one tree on one column. A composite index is one tree on multiple columns sorted together. Use a single-column index when you filter on that one column alone. Use a composite when you filter on those columns together with `AND`, or when you need a sorted order across columns. A composite on `(a, b)` already covers `a` alone, so you rarely need both `(a)` and `(a, b)`.

**Composite index vs covering index.** These are not alternatives — they overlap. Composite describes how many columns are in the index key. Covering describes whether the index contains everything the query needs so the table is never read. A composite is often what makes a covering index possible, because it already holds multiple columns. But a covering index can also be a single-column index if the query only needs that column.

**Composite index vs index merge (two singles intersected).** Index merge is MySQL stitching two separate index scans together at query time. A composite index is one pre-sorted structure that already has the columns together. Merge is a fallback that costs more CPU and I/O. Composite is a design choice that makes the common multi-column query fast by construction. Rule: if you have a frequent `WHERE a = ? AND b = ?`, build `(a, b)` instead of hoping the merge saves you.

**Composite index in MySQL vs compound index in MongoDB.** Same idea — one index on multiple fields, same leftmost prefix rule, same order sensitivity. The difference is syntax and storage engine details, but the design thinking transfers directly. If you understand `(last_name, first_name)` in MySQL, you understand `{ last_name: 1, first_name: 1 }` in MongoDB.

## 8. 🧠 The Memory Hook

A composite index is a phone book sorted by last name, then first name — skip the last name and the whole book is useless, so always lead with the column you actually search by.
