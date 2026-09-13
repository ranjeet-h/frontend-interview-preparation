# How do you optimize slow MySQL queries

## 1. The Real-World Problem — When You Actually Hit This

Your app was fast in development. The `orders` table had 500 rows, every page loaded in 80ms. Then you ship to production.

Three months later, support pings you at 2pm. The dashboard is timing out. You check monitoring and see the `mysql.slow_log` table flooding with the same query. `long_query_time` is set to 2 seconds and you now have thousands of entries per hour. The page that shows "recent orders for this customer" went from 80ms to 8 seconds. Worse, your read replica is lagging 40 seconds behind the primary because that same slow query is holding locks and burning CPU on the replica. The frontend shows a spinner, the API times out, retries pile on, and now your primary is under even more load.

Nobody changed the code. The data just grew. A query that did a full table scan was invisible at 500 rows and brutal at 2 million rows. Optimizing slow MySQL queries is the workflow you run the moment that slow log starts flooding — find the bad query, prove why it is slow, fix the access path, and prove it stays fast.

## 2. The Analogy — Make the Mechanic Obvious

Think of a library.

Without an index, finding every book by "authors whose last name starts with S and published after 2022" means walking every single shelf, opening every book, and checking. That is a full table scan. It works when the library has 100 books. It collapses when it has 2 million.

An index is like the card catalog. It is a sorted list that says "author S = shelf 4, row 2" so you walk straight there. MySQL's B-Tree index works the same way — sorted entries that point to rows, so the engine can jump to the right range instead of scanning everything.

But the catalog only helps if you use it right:

- If you ask for "any book where the title contains 'the' somewhere inside," the catalog cannot help — that is `LIKE '%the%'`, no index can jump to it.
- If you ask for "give me every field about the book" the catalog gives you the location but you still walk to the shelf for the book itself. If you only asked for "title and author," the catalog already has that — no trip to the shelf needed.
- If you ask for "all books with status = 'active'" and 95% of books are active, the catalog is almost useless — you would still touch nearly every book.

`EXPLAIN` is you asking the librarian before you run the search: "How would you find this?" She tells you: "I would scan every shelf (type: ALL), I expect to touch 1.8 million books (rows), and I will need a sorting table (Using filesort)." Now you know to add or fix the catalog, rewrite the request, or refresh the catalog stats before you waste time running it for real.

## 3. The Full Explanation — How It Actually Works

Optimizing in MySQL is not guessing. It is a short loop you can run every time: capture, explain, fix, verify.

**Capture — find the real culprit with the slow query log.** MySQL does not log everything by default because that would be expensive. You turn on the log that only keeps queries slower than a threshold.

That threshold is `long_query_time` in seconds. `slow_query_log = ON` turns the log on. `log_queries_not_using_indexes = ON` also catches full scans that happened to be fast today but will be slow tomorrow. You can log to a file or to a table (`log_output = TABLE` puts rows in `mysql.slow_log`). Most teams run `mysqldumpslow` or `pt-query-digest` on that file to group identical query patterns and sort by total time, not just one slow run.

This is your starting point. Do not optimize what you think is slow. Optimize what the log proves is slow.

**Explain — ask MySQL how it would run the query.** This is where [EXPLAIN](what-is-explain-in-mysql.md) comes in. You put `EXPLAIN` in front of your `SELECT` and MySQL shows the plan without running the full query.

Read these columns first:

- `type` — how MySQL accesses rows, from worst to best. `ALL` means full table scan (touched every row). `index` means full index scan (scanned the whole index, still bad). `range` means it used an index to scan a range like `WHERE created_at BETWEEN '2024-01-01' AND '2024-01-31'` or `IN (...)`. `ref` means it looked up by a non-unique index like `WHERE customer_id = 123`. `eq_ref` and `const` mean a unique lookup like `WHERE id = 5` — the fastest. You want `ref` or `range` at least; `ALL` on a big table is your red flag.
- `key` — which index MySQL actually chose. `NULL` means none. `possible_keys` shows what it considered.
- `rows` — estimated rows it thinks it will touch. This is an estimate from statistics, not a count.
- `Extra` — extra work. `Using index` is good, it means a covering index — MySQL answered from the index alone without touching the table. `Using where` means it filtered after reading. `Using filesort` means it needs a separate sort pass because the index order did not match your `ORDER BY`. `Using temporary` means it created a temp table for `GROUP BY` or `DISTINCT`. `Using index condition` means index condition pushdown is filtering inside the storage engine.

If you see `type: ALL` and `rows: 1.8M` and `Extra: Using where; Using filesort`, you have found the problem.

**Refresh stats — make sure the estimates are honest.** MySQL's optimizer picks an index based on statistics about how many distinct values a column has and how data is distributed. After a big import, delete, or migration those stats can be stale and the `rows` estimate is wrong. `ANALYZE TABLE orders` tells InnoDB to resample and update those stats. It is cheap, takes a read lock briefly, and often fixes a bad plan without changing any code. Run it after bulk loads. Do not expect it to fix a missing index.

**Fix — three levers, in order.**

1. *Indexing* is usually first. The right index lets MySQL change `ALL` to `ref` or `range`. Rules that matter: put the most selective equality column first in a composite index, then the range or sort column. Respect the leftmost prefix — an index on `(customer_id, created_at)` helps `WHERE customer_id = ?` and `WHERE customer_id = ? AND created_at > ?` but not `WHERE created_at > ?` alone. If your query selects only a few columns, a covering index that includes those columns avoids the extra table lookup (`Using index`). Every index speeds reads and slows writes, and makes the table bigger, so do not add five indexes for one query.

2. *Query rewriting* is second. Sometimes the index exists but the query prevents its use. Wrapping an indexed column in a function like `WHERE YEAR(created_at) = 2024` hides the index — rewrite to `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'`. `SELECT *` breaks covering indexes — list only the columns you need. `OR` across two different columns often kills index use — a `UNION` of two indexed lookups can be faster. Large `OFFSET` like `LIMIT 20 OFFSET 100000` still scans and discards 100k rows — keyset pagination with `WHERE id > ? LIMIT 20` is stable. Implicit type conversion like `WHERE varchar_col = 123` (number vs string) also prevents index use.

3. *Optimizer hints* are last and sparingly. When you know more than the optimizer because stats are odd or data is skewed, you can nudge it: `SELECT * FROM orders USE INDEX (idx_customer_created) WHERE ...`, `FORCE INDEX`, `IGNORE INDEX`, or `STRAIGHT_JOIN` to force join order. In MySQL 8 you also have optimizer hints like `SELECT /*+ SET_VAR(optimizer_switch='index_merge=off') */ ...`. Hints are brittle — data distribution changes and the hint that helped today hurts tomorrow. Use them only after you have tried a proper index and rewrite, and comment why the hint exists.

**Verify — run EXPLAIN again and watch production.** After each change, run `EXPLAIN` again. Check `type` moved off `ALL`, `key` is the new index, `rows` dropped, `Extra` no longer says `Using filesort` or `Using temporary` unless expected. Then check the slow log: `Rows_examined` should drop close to `Rows_sent` (you are not scanning 100x more rows than you return). Also watch `Innodb_rows_read`, CPU, and replica lag. An index that looks great in EXPLAIN but doubles write latency is not a win for a write-heavy table.

This loop is why slow-query optimization is a workflow, not a trick. The log tells you where to look, EXPLAIN tells you why, indexes and rewrites change the access path, and the log proves you fixed it.

## 4. See It In Practice — Real Code or Queries

All examples assume MySQL 8.0 with InnoDB.

**Step 1: Turn on the slow log and find the worst pattern**

```sql
-- Turn on slow query logging (dynamic, no restart)
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time = 1;          -- log queries slower than 1 second
SET GLOBAL log_queries_not_using_indexes = ON;
SET GLOBAL log_output = 'FILE';           -- or 'TABLE' to query mysql.slow_log

-- Where is the log?
SHOW VARIABLES LIKE 'slow_query%';
SHOW VARIABLES LIKE 'long_query_time';
SHOW VARIABLES LIKE 'log_output';

-- On the host, group and rank (outside MySQL)
-- $ mysqldumpslow -t 10 /var/log/mysql/mysql-slow.log
-- $ pt-query-digest /var/log/mysql/mysql-slow.log --limit 10

-- If you logged to TABLE:
SELECT query_time, lock_time, rows_examined, rows_sent, sql_text
FROM mysql.slow_log
ORDER BY query_time DESC
LIMIT 10;
```

**Step 2: The slow query and its bad plan**

```sql
-- The dashboard query that flooded the log
-- Schema: orders(id PK, customer_id INT, status VARCHAR(20), total DECIMAL, created_at DATETIME, INDEX idx_customer (customer_id))
SELECT *
FROM orders
WHERE customer_id = 1042
  AND YEAR(created_at) = 2024
ORDER BY created_at DESC
LIMIT 20;

-- Ask MySQL how it would run it
EXPLAIN SELECT *
FROM orders
WHERE customer_id = 1042
  AND YEAR(created_at) = 2024
ORDER BY created_at DESC
LIMIT 20;

-- Typical bad output:
-- type: ref  (uses idx_customer, but YEAR() hides created_at)
-- key: idx_customer
-- rows: 180000  (still scans many rows for that customer)
-- Extra: Using where; Using filesort
-- It fetched every row for that customer, applied YEAR() row by row, then sorted.
```

**Step 3: Rewrites that let the index work**

```sql
-- Fix 1: stop wrapping the indexed column in a function
-- Fix 2: avoid SELECT * so a covering index can help
-- Fix 3: composite index that matches equality + sort
CREATE INDEX idx_orders_customer_created ON orders (customer_id, created_at DESC);
-- Include total and status if you want a covering index for this exact query
-- CREATE INDEX idx_orders_customer_created_cover ON orders (customer_id, created_at DESC, status, total);

ANALYZE TABLE orders;  -- refresh stats so EXPLAIN rows is honest

SELECT id, status, total, created_at
FROM orders
WHERE customer_id = 1042
  AND created_at >= '2024-01-01'
  AND created_at <  '2025-01-01'
ORDER BY created_at DESC
LIMIT 20;

-- New EXPLAIN:
-- type: range   (good — range on the composite index)
-- key: idx_orders_customer_created
-- rows: 420     (estimate now close to reality)
-- Extra: Using where; Using index  (if covering) and no Using filesort because index order matches ORDER BY
```

**Step 4: More rewrites you reach for often**

```sql
-- OR that kills index use -> rewrite as UNION
-- Slow:
SELECT * FROM orders WHERE customer_id = 1042 OR status = 'pending';

-- Faster when each branch has an index:
SELECT id, status, total, created_at FROM orders WHERE customer_id = 1042
UNION ALL
SELECT id, status, total, created_at FROM orders WHERE status = 'pending' AND customer_id <> 1042;

-- LIKE with leading wildcard cannot use B-Tree index
-- Slow: WHERE email LIKE '%@gmail.com'
-- If you need this often, consider a full-text index or a reversed/email-domain column

-- Implicit conversion prevents index use
-- If phone is VARCHAR, do not compare with a number
-- Slow: WHERE phone = 9876543210
-- Fast: WHERE phone = '9876543210'

-- Large OFFSET pagination — avoid scanning and discarding
-- Slow: SELECT ... ORDER BY id LIMIT 20 OFFSET 100000
-- Fast keyset pagination:
SELECT id, status, total, created_at
FROM orders
WHERE id > 100000
ORDER BY id
LIMIT 20;
```

**Step 5: Hints when you must nudge the optimizer**

```sql
-- Use only after the index and rewrite did not stick

-- Force a specific index (brittle — prefer to fix stats or index first)
SELECT * FROM orders USE INDEX (idx_orders_customer_created)
WHERE customer_id = 1042 AND created_at >= '2024-01-01';

-- Force join order when the optimizer picks the wrong driving table
SELECT STRAIGHT_JOIN o.*, c.name
FROM orders o
JOIN customers c ON c.id = o.customer_id
WHERE o.created_at >= '2024-01-01';

-- MySQL 8 optimizer hint to disable a behavior for one query
SELECT /*+ SET_VAR(optimizer_switch='index_merge=off') */ *
FROM orders
WHERE customer_id = 1042 OR status = 'pending';
```

Check after every change: re-run `EXPLAIN`, compare `Rows_examined` vs `Rows_sent` in the slow log, and watch replica lag and write latency. A plan that looks good on an empty dev database means nothing.

## 5. Interview Questions — All of Them, Done Properly

**Q: How do you find slow queries in MySQL in production?**

You do not guess, you read the slow query log. Turn on `slow_query_log`, set `long_query_time` to something like 1 second for a busy app (0.5 if you are chasing tail latency), and turn on `log_queries_not_using_indexes` to catch full scans that are still fast by luck. You can log to `FILE` or to `mysql.slow_log` with `log_output = TABLE`. Then you aggregate with `mysqldumpslow` or `pt-query-digest` — sort by total time and by `Rows_examined / Rows_sent` ratio, not just one slow sample. You also watch `performance_schema` and `SHOW PROCESSLIST` for live long-running queries, but the slow log is the system of record interviewers want to hear.

**Q: Walk me through how you use EXPLAIN to optimize a query.**

You run `EXPLAIN SELECT ...` and read four things in order. First `type` — if it is `ALL` on a large table, that query is scanning everything and you have found the main problem. `ref` means it did an indexed lookup on a non-unique key, `range` means it scanned an index range, both are good. Second `key` — which index it actually used; `NULL` means none, even if `possible_keys` shows options. Third `rows` — the estimate of how many rows it will touch. Fourth `Extra` — `Using index` means a covering index with no table fetch, `Using filesort` means it needs a separate sort, `Using temporary` means a temp table for grouping. You fix until `type` is off `ALL`, `key` is the right index, `rows` drops dramatically, and `Extra` loses `filesort`/`temporary` unless expected. The deep dive on each column lives in [EXPLAIN](what-is-explain-in-mysql.md).

**Q: What does `rows` in EXPLAIN mean and can you trust it?**

It is an estimate based on index statistics and histograms, not an exact count. InnoDB samples pages to guess cardinality, so `rows: 420` might actually touch 200 or 800. After bulk loads, deletes, or if `ANALYZE TABLE` has not run in a while, the estimate can be very wrong and lead the optimizer to pick the wrong index. That is why `ANALYZE TABLE` exists — it refreshes those stats. Always cross-check `Rows_examined` in the real slow log after you run the query; if `Rows_examined` is 100x `Rows_sent`, you are still scanning too much regardless of what `rows` guessed.

**Q: How do you choose the right index for a slow query?**

You match the index to the query shape. For `WHERE customer_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at`, the natural composite is `(customer_id, created_at)`. Equality columns go first, then range or sort columns. The order matters because of the leftmost prefix rule — queries that only filter on `created_at` cannot use an index that starts with `customer_id`. If the query only selects a few columns, add those to the end to make it covering so you get `Using index` and avoid table lookups. You also check selectivity — an index on `status` where 95% of rows are `paid` helps almost nothing on its own. And you remember writes: every extra index makes inserts and updates slower and bigger.

**Q: When would you rewrite the query instead of adding an index?**

When the query hides the index that already exists. Examples: `WHERE YEAR(created_at) = 2024` wraps the indexed column in a function so the B-Tree cannot be used — rewrite to a range on `created_at`. `WHERE email LIKE '%@gmail.com'` with a leading wildcard cannot use a B-Tree. `OR` across two columns often prevents index use — a `UNION ALL` of two indexed lookups is often faster. `SELECT *` prevents a covering index — listing columns lets the index answer without touching the table. Implicit conversion like `WHERE varchar_col = 123` also disables the index. Fixing the query shape is cheaper and more durable than adding or hinting an index.

**Q: What are optimizer hints and when should you use them?**

Hints are comments or clauses that override the optimizer's choice for one query: `USE INDEX`, `FORCE INDEX`, `IGNORE INDEX`, `STRAIGHT_JOIN`, or MySQL 8's `/*+ ... */` hints like `SET_VAR(optimizer_switch=...)`. You use them last, after you have fixed the index and rewritten the query, when the optimizer still picks the wrong plan because stats are skewed or the data distribution is unusual. They are brittle — the hint that fixes today's skewed data can hurt next month when the distribution shifts — so you must comment why the hint exists and re-measure after data grows. Interviewers want to hear "hints are a last resort."

**Q: How do you verify the fix actually worked?**

Three checks. First, `EXPLAIN` again — `type` off `ALL`, correct `key`, lower `rows`, no unwanted `Using filesort` or `Using temporary`. Second, the slow log — `Rows_examined` should now be close to `Rows_sent`, and `query_time` drops below `long_query_time` so the query stops appearing. Third, system metrics — primary CPU, buffer pool hit rate, and replica lag all improve. If you added an index, also watch write latency and table size — a fix that halves read time but doubles write time on a write-heavy table is not a clean win.

## 6. The Traps — What Goes Wrong in Production

**Trusting `rows` and skipping ANALYZE TABLE.** Teams see `rows: 10` in EXPLAIN and declare the query fast, then wonder why it still scans 2 million rows. `rows` is an estimate from stale statistics. After a big import or migration, stats can be very stale. The fix is simple: run `ANALYZE TABLE orders` to refresh stats, then re-run `EXPLAIN` and compare to real `Rows_examined` in the slow log. Never treat an estimate as a measurement.

**Creating an index on a low-cardinality column.** Adding `INDEX(status)` when `status` has three values and one of them covers 90% of rows barely helps. MySQL will still scan almost the whole table, but now every insert pays the cost of maintaining that index. Check selectivity first: `SELECT status, COUNT(*) FROM orders GROUP BY status` tells you the distribution. For low-cardinality columns, a composite that starts with a selective column like `(customer_id, status)` is far more useful than a single-column index on `status` alone.

**Adding indexes without measuring write cost.** Every index makes reads faster and writes slower. On a table that takes 500 inserts per second, adding four indexes can push write latency up and increase disk and buffer pool pressure. Teams keep adding indexes for each slow query and never drop unused ones. Run `SELECT * FROM sys.schema_unused_indexes` periodically and drop indexes that never appear in `key`. One well-chosen composite beats three overlapping single-column indexes.

**Wrapping indexed columns in functions or mismatching types.** `WHERE YEAR(created_at) = 2024`, `WHERE LOWER(email) = 'a@b.com'`, and `WHERE phone = 123` (string column compared to a number) all disable the index. MySQL has to convert every row before comparing, so it falls back to `type: ALL`. Rewrite to a sargable form: `WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01'`, store a normalized column, or compare with the correct type `'123'`.

**Chasing `long_query_time` alone and ignoring `Rows_examined`.** A query that runs in 0.9 seconds with `Rows_examined = 2M` and `Rows_sent = 10` will not appear in a 1-second slow log, but it is still burning CPU and causing replica lag. Sort your digest by total `Rows_examined` and by `Rows_examined / Rows_sent` ratio. The worst offenders are often fast-looking queries that scan too much.

**Using optimizer hints as the first fix.** `FORCE INDEX` feels decisive but it freezes the plan. When data distribution changes, the forced index can become the wrong choice and you have hidden the real problem (a missing composite or stale stats). Use hints only after indexing and rewriting, document why, and set a reminder to re-test without the hint after the next big data change.

## 7. Compare With Related Concepts

**Optimizing a single slow query vs. general database performance tuning.** Fixing one slow query is targeted — you use the slow log, EXPLAIN, one index or rewrite, and you measure that one query's `Rows_examined` and latency. General performance tuning is broader: buffer pool sizing, connection pooling, schema design, partitioning, read replicas, and caching. The rule is fix the bad access path first because one missing index can dwarf every other tuning knob. Adding memory or a replica will not save a query that scans 2 million rows to return 20.

**Fixing the query vs. throwing hardware or cache at it.** Adding a bigger instance or putting Redis in front of the query can hide the symptom for a week. The query still scans too much, still loads the replica, and still breaks the moment the cache misses. The rule is fix the data access before you scale the machines. Cache what is proven fast; do not cache a full scan.

**EXPLAIN vs. actually running the query.** `EXPLAIN` shows the plan and estimates without executing the full data fetch — fast and safe on production. `EXPLAIN ANALYZE` in MySQL 8.0.18+ actually runs the query and shows real row counts and timing, which catches bad estimates. Use `EXPLAIN` for fast iteration, use `EXPLAIN ANALYZE` when `rows` looks suspicious to see actual vs estimated.

**Slow query log vs. Performance Schema / `SHOW PROCESSLIST`.** The slow log is history — every query slower than `long_query_time`, persisted for digging into trends. `SHOW PROCESSLIST` and `performance_schema` are live — what is running right now and where it is waiting (lock, I/O, sorting). Use the live views to catch a query that is stuck this second; use the slow log to find the pattern that is hurting you every hour.

## 8. 🧠 The Memory Hook

The slow log tells you who did it, EXPLAIN tells you how they did it, and the index decides whether MySQL walks every shelf or walks straight to the right one — if `type` is still `ALL`, you have not fixed it yet.
