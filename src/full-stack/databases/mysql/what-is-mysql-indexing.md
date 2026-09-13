# MySQL Indexing: B+Tree Internals, Clustered vs Secondary Indexes, and Query Optimization

## 1. The Real-World Problem — When You Actually Hit This

Your e-commerce platform has been fine for months. In development you had 500 rows and every page loaded in 5 ms. Six months later the `orders` table has 50 million rows. A customer opens their order history and you run:

```sql
SELECT * FROM orders WHERE customer_id = 94812 AND status = 'COMPLETED' ORDER BY created_at DESC LIMIT 10;
```

Without an index on `customer_id`, MySQL has no way to know where those 10 rows live. It does a Full Table Scan (`type: ALL`). InnoDB reads every 16KB page from disk into the Buffer Pool, streaming more than 20 GB of data to answer one query. CPU hits 100%, hot pages get evicted from RAM, connections back up, and the query takes 45 seconds. Put 50 users on that page at once and your API gateway starts throwing 504s.

So you panic and add an index on every column — 15 single-column indexes. Reads get a bit better, but writes fall off a cliff. Every `INSERT`, `UPDATE`, and `DELETE` now has to update 15 separate B+Tree structures inside the same transaction. Page splits fragment storage, write amplification spikes, and write latency jumps 8x.

MySQL indexing exists to fix both extremes: turn an `O(N)` scan of every row into an `O(log N)` tree walk that finds rows in 3 to 4 page reads, without destroying write throughput.

## 2. The Analogy — Make the Mechanic Obvious

Think of a 2,000-page printed medical encyclopedia.

The Clustered Index is the physical book itself. The whole volume is printed and bound in strict order by Disease ID — that is the Primary Key. The full record — symptoms, medications, clinical notes — lives right on those pages. Paper can only be bound in one order, so a table can only have one clustered index.

A Secondary Index is the "Index of Symptoms" in the last 20 pages. There, entries are sorted by symptom — "Abdominal Pain", "Chronic Cough", "Dizziness". But the symptom index does not reprint the whole record. Next to "Chronic Cough" it just lists a pointer: `Disease ID #4820 (Asthma)`.

The secondary lookup: you want "Chronic Cough" so you flip to the back index (step 1), find `Disease ID #4820`, then flip to page 740 where Disease #4820 is bound (step 2). Two lookups.

A Covering Index: suppose that back index also lists severity — `"Chronic Cough" -> Severity: High, Disease ID #4820`. If someone only asks "what is the severity of Chronic Cough?", you read "High" straight off the back pages. You never open the big book. One lookup, done. That is `Using index` in MySQL.

The B+Tree lobby directory: at the entrance a sign says "A–H Floor 1, I–P Floor 2, Q–Z Floor 3" (root node). On Floor 2 another sign says "N–O Aisle 4" (internal node). In Aisle 4 the books sit side by side with a ribbon tying the end of one book to the start of the next (leaf linked list). If you need everything from "Nail Infection" to "Nosebleed", you walk to the shelf once and pull books along the ribbon without going back to the lobby.

## 3. The Full Explanation — How It Actually Works

InnoDB stores every table as a B+Tree. The choice of tree, what lives in leaf pages, and how secondary indexes point back to the primary key explains why some queries are microseconds and others time out.

**B+Tree is the default, and why it is shallow**

Databases are limited by disk I/O. Each page you read costs time. A normal binary tree has at most two children per node, so 50 million rows needs about `log2(50M) ≈ 26` hops — 26 random page reads.

InnoDB stores data in fixed 16KB pages. A B+Tree is a multi-way tree built to maximize fanout — how many child pointers fit on one page. An internal node stores only keys and child pointers. If a `BIGINT` primary key is 8 bytes and a pointer is 6 bytes, one entry is about 14 bytes. With page headers, a single 16KB page holds roughly 1,170 pointers:

- Level 1 (root): 1 page → 1,170 pointers to Level 2
- Level 2: 1,170 pages × 1,170 pointers → 1,368,900 pointers to leaves
- Level 3 (leaves): 1,368,900 leaves × ~100 rows each → ~136 million rows

So three levels hold over 130 million rows. Four levels hold over 160 billion. The root and often Level 2 live in the Buffer Pool in RAM, so finding any row among 100 million rows costs at most one physical disk read, often zero. In MySQL, when you write `USING BTREE` (or write nothing at all) for InnoDB, you are getting this B+Tree — MySQL labels it BTREE even though under the hood it is a B+Tree.

**B+Tree vs B-Tree vs Hash vs FULLTEXT**

A classic B-Tree stores full row data in internal nodes too. That bloats internal nodes, fanout drops from 1,170 to maybe 15–20, depth grows to 6–10, and every lookup needs many more reads. A B+Tree stores full rows only in leaf pages. Internal nodes hold only keys and pointers, which is why it stays so shallow. Leaves are also doubly linked (`PAGE_PREV`/`PAGE_NEXT`), so a range scan like `WHERE id BETWEEN 100 AND 500` finds the first key in `O(log N)` and then walks the leaf chain sequentially without climbing back up.

Hash indexes give `O(1)` lookups for exact equality (`WHERE id = 5`). MySQL's MEMORY engine uses HASH by default for that reason — great for a temporary in-memory lookup table. But hash has no order, so it cannot do range scans (`WHERE age > 21`), prefix searches (`LIKE 'abc%'`), `ORDER BY`, or partial composite-key lookups. InnoDB also builds an Adaptive Hash Index internally in RAM for hot B+Tree pages, but you do not create it by hand — it is automatic.

FULLTEXT is a different structure entirely. It is an inverted index: term → list of documents. You create it with `FULLTEXT` when you need to search words inside text (`WHERE MATCH(col) AGAINST('cough fever')`). A B+Tree cannot efficiently answer `LIKE '%word%'` inside a huge text column, but FULLTEXT tokenizes the text and looks up the term list. InnoDB supports `FULLTEXT` since MySQL 5.6, MyISAM did before that. Use it for natural-language search, not for exact filters or sorting.

Plain rule: InnoDB defaults to B+Tree, MEMORY defaults to Hash, and text search needs FULLTEXT. Pick the structure that matches the query shape.

**Clustered index — the table is the index**

In InnoDB every table is index-organized. There is no separate heap file. The leaf pages of the clustered index ARE the table:

- If you define `PRIMARY KEY`, InnoDB uses it as the clustered index. Rows are physically ordered by that key.
- If you do not define one but have a `UNIQUE NOT NULL` column, InnoDB picks the first one.
- If neither exists, InnoDB creates a hidden 6-byte auto-increment row ID (`GEN_CLUST_INDEX`). That hidden index is shared globally and causes mutex contention under concurrent writes — always define an explicit primary key.

There is only one clustered index because rows can only be stored in one physical order.

**Secondary indexes store the primary key**

Any index on a non-primary column is a secondary index — a separate B+Tree. Its leaves do not hold full rows and do not hold disk offsets. They hold the indexed column value plus the primary key value. That small detail drives everything.

When you run `SELECT name, phone FROM users WHERE email = 'alex@example.com'` with an index on `email`:

1. Search the `idx_email` B+Tree to find the leaf for `'alex@example.com'`.
2. Read the primary key stored there, say `id = 7421`.
3. Do a second B+Tree walk on the clustered index with `id = 7421` to fetch `name` and `phone`.

That second hop is the Index Hop or Bookmark Lookup. It costs one extra tree traversal per matching row.

**Covering index — `Using index`**

If the query only asks for columns already inside the secondary index (plus the primary key, which InnoDB silently appends to every secondary leaf), MySQL skips the second hop entirely:

```sql
SELECT id, email FROM users WHERE email = 'alex@example.com';
```

Both `email` and `id` are already in the `idx_email` leaf page, so MySQL answers straight from the secondary index. In `EXPLAIN`, the `Extra` column shows `Using index`. That is the signal for a covering index — no table lookup, much less I/O.

**Composite indexes and the leftmost prefix rule**

A composite index like `INDEX (tenant_id, status, created_at)` is sorted first by `tenant_id`, then by `status` inside each `tenant_id`, then by `created_at` inside each `status`.

MySQL can only use it if the query filters from the left without gaps:

- `WHERE tenant_id = 5` → uses index (prefix `tenant_id`)
- `WHERE tenant_id = 5 AND status = 'ACTIVE'` → uses prefix `tenant_id, status`
- `WHERE tenant_id = 5 AND status = 'ACTIVE' AND created_at > '2024-01-01'` → uses all three
- `WHERE status = 'ACTIVE'` → cannot use it — leftmost column `tenant_id` is missing
- `WHERE tenant_id = 5 AND created_at > '2024-01-01'` → uses only `tenant_id`; cannot position on `created_at` because `status` is missing and `created_at` is not globally sorted

Think of it like a phone book sorted by last name, then first name: you cannot find everyone named "John" without knowing the last name, because "John" is scattered throughout.

**Range cutoff and Index Condition Pushdown**

When a composite index hits a range condition (`>`, `<`, `BETWEEN`, `LIKE 'abc%'`), the B+Tree stops using later columns for tree positioning. With `INDEX (a, b, c)` and `WHERE a = 1 AND b > 10 AND c = 'X'`, `a` is an exact position, `b` is a range position, but `c` cannot be used to navigate the tree because inside a `b > 10` range, rows are not sorted by `c`.

MySQL still optimizes this with Index Condition Pushdown (ICP), added in MySQL 5.6. Instead of hopping to the clustered index for every row matching `a = 1 AND b > 10` and letting the server layer filter `c = 'X'`, InnoDB checks `c = 'X'` right inside the secondary leaf pages first. Rows that fail are discarded before the expensive hop. In `EXPLAIN` you see `Using index condition` when ICP saves work.

**Cardinality and the optimizer**

Cardinality is how many distinct values a column has. High cardinality (email, user ID) is selective — an index narrows things a lot. Low cardinality (boolean `is_active`, a `status` where 90% is `COMPLETED`) is not selective.

MySQL's cost-based optimizer estimates I/O. If a secondary index would match 30% of a huge table and the query is not covering, each match needs a random hop to the clustered index. Thousands of random reads is slower than one sequential scan of the table in big 16KB chunks, so the optimizer will choose a Full Table Scan even though an index exists. InnoDB estimates cardinality by sampling pages, and after big bulk loads you refresh it with `ANALYZE TABLE`.

## 4. See It In Practice — Real Code or Queries

Create a realistic orders table, add indexes with explicit `CREATE INDEX` statements, and inspect plans with `EXPLAIN`.

```sql
-- Base table with a clustered primary key
CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    order_number VARCHAR(64) NOT NULL,
    status ENUM('PENDING','PROCESSING','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
    total_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    customer_notes VARCHAR(1000) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_number (order_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Runnable CREATE INDEX examples
CREATE INDEX idx_tenant_customer_created ON orders (tenant_id, customer_id, created_at);
CREATE INDEX idx_tenant_status ON orders (tenant_id, status);
-- Prefix index on a long text column to save B+Tree space
CREATE INDEX idx_notes_prefix ON orders (customer_notes(50));
-- Full-text index for natural language search inside notes
CREATE FULLTEXT INDEX ft_notes ON orders (customer_notes);
-- MEMORY engine example (hash default) for a temp lookup table
CREATE TABLE temp_sessions (session_id VARCHAR(64) PRIMARY KEY, user_id INT) ENGINE=MEMORY;

INSERT INTO orders (tenant_id, customer_id, order_number, status, total_amount, customer_notes, created_at) VALUES
(1, 101, 'ORD-2024-001', 'COMPLETED', 149.50, 'Leave package at front door please', '2024-01-15 10:00:00'),
(1, 101, 'ORD-2024-002', 'COMPLETED',  89.00, 'Ring the bell twice on arrival',      '2024-02-10 14:30:00'),
(1, 102, 'ORD-2024-003', 'PENDING',   210.00, 'Call before delivery',                '2024-02-12 09:15:00'),
(2, 201, 'ORD-2024-004', 'PROCESSING', 45.00, NULL,                                  '2024-02-15 11:00:00');
```

Now inspect how the optimizer uses those indexes.

```sql
-- Scenario A: Non-covering lookup (needs hop to clustered index)
-- idx_tenant_customer_created finds the PK, then fetches total_amount from clustered index
EXPLAIN SELECT id, total_amount FROM orders
WHERE tenant_id = 1 AND customer_id = 101;
-- type: ref, key: idx_tenant_customer_created, key_len: 12
-- Extra: NULL or Using index condition  -> had to visit the table

-- Scenario B: Covering index (no hop) + sorted already
-- id is implicitly in every secondary leaf, so all requested columns are in the index
EXPLAIN SELECT id, created_at FROM orders
WHERE tenant_id = 1 AND customer_id = 101
ORDER BY created_at DESC;
-- type: ref, key: idx_tenant_customer_created
-- Extra: Using index  -> fully covered, and no Using filesort because created_at is sorted in the tree

-- Scenario C: Leftmost prefix violation
EXPLAIN SELECT * FROM orders WHERE customer_id = 101;
-- type: ALL, key: NULL  -> cannot use idx_tenant_customer_created because tenant_id is missing

-- Scenario D: Index Condition Pushdown after a range
-- With INDEX (tenant_id, status, created_at) imagine query:
-- WHERE tenant_id = 1 AND status > 'PENDING' AND created_at > '2024-01-01'
-- tenant_id positions the tree, status does a range scan, created_at is checked via ICP
EXPLAIN SELECT id FROM orders
WHERE tenant_id = 1 AND status > 'PENDING' AND created_at > '2024-01-01';
-- Extra: Using index condition  -> created_at filtered inside index before hopping

-- Scenario E: Prefix index scan
EXPLAIN SELECT id, order_number FROM orders
WHERE customer_notes LIKE 'Leave package%';
-- type: range, key: idx_notes_prefix
-- Extra: Using index condition

-- Scenario F: FULLTEXT search (uses inverted index, not B+Tree range)
SELECT id FROM orders WHERE MATCH(customer_notes) AGAINST('package delivery' IN NATURAL LANGUAGE MODE);

-- Inspect optimizer choices with full detail
EXPLAIN ANALYZE SELECT id, created_at FROM orders WHERE tenant_id = 1 AND customer_id = 101;
EXPLAIN FORMAT=TREE SELECT id FROM orders WHERE tenant_id = 1 AND customer_id = 101;

-- Cardinality and stats
SHOW INDEX FROM orders;
ANALYZE TABLE orders; -- refresh sampled cardinality after bulk loads
```

Every `EXPLAIN` above is runnable on a local MySQL 8.0 instance with the `orders` table. `EXPLAIN ANALYZE` actually executes the query and shows real timing.

## 5. Interview Questions — All of Them, Done Properly

**Q: Why does InnoDB use B+Trees by default instead of Hash or plain B-Trees?**

Because disk I/O decides performance. A Hash table is `O(1)` for `WHERE id = 5` but has no ordering, so it cannot do ranges, `ORDER BY`, `LIKE 'abc%'`, or partial composite matches. MEMORY uses hash for that exact-equality speed, and InnoDB builds an adaptive hash in RAM automatically for hot pages — but the on-disk structure needs order. A plain B-Tree stores row data in internal nodes too, which shrinks fanout from ~1,170 pointers per page to ~15 and pushes depth from 3–4 to 6–10, doubling or tripling disk reads. A B+Tree keeps internal nodes slim (keys + pointers only), stays shallow even for billions of rows, and links leaves together so range scans walk sequentially. That is why `CREATE INDEX ... USING BTREE` is the InnoDB default — and that BTREE is really a B+Tree.

**Q: When would you use a HASH index or a FULLTEXT index instead of a B-Tree?**

Use HASH when the workload is pure point lookups on an in-memory table and you never need ordering or ranges — the MEMORY engine does this by default for temporary session or counter tables. Use FULLTEXT when you need natural-language search inside text: `MATCH(body) AGAINST('refund delayed')` tokenizes words and looks them up in an inverted index (term → doc list). A B+Tree can handle `LIKE 'refund%'` with a range scan on a prefix index, but it cannot handle `LIKE '%refund%'` without scanning everything. FULLTEXT is built for that. For everything else — filters, joins, `ORDER BY`, composite conditions — B+Tree is the right default.

**Q: What is the difference between a Clustered Index and a Secondary Index in InnoDB?**

The clustered index is the table. Its leaves hold the full row, physically ordered by the primary key. There is exactly one per InnoDB table — the one defined by `PRIMARY KEY`, or InnoDB's hidden 6-byte auto-increment if you forget one. A secondary index is a separate B+Tree whose leaves hold only the indexed columns plus the primary key value. To return columns not in the secondary index, MySQL does an index hop: search the secondary B+Tree, read the PK, then search the clustered B+Tree. That is why wide secondary indexes cost more space and why keeping the primary key small (8-byte `BIGINT` vs 36-char UUID string) keeps every secondary index smaller.

**Q: What is a covering index and how do you prove a query is using one?**

A covering index is one where every column the query touches — `SELECT`, `WHERE`, `JOIN`, `ORDER BY`, `GROUP BY` — lives inside the secondary index itself (remember the PK is always implicitly there). MySQL then never visits the clustered index. You prove it with `EXPLAIN`: the `Extra` column says `Using index`. If you see `Using index condition` instead, that is ICP filtering inside the index but still needing a hop; `Using index` alone means zero hops. Designing covering indexes for your hottest queries (often `SELECT id, created_at WHERE tenant_id = ?`) is the single biggest read speedup you can get.

**Q: What is the leftmost prefix rule and how does a range condition break it?**

A composite index `INDEX (tenant_id, status, created_at)` is sorted by `tenant_id`, then `status` within each `tenant_id`, then `created_at` within each `status`. MySQL can only walk the tree if you fix columns from the left without gaps. `WHERE tenant_id = 5` works, `WHERE tenant_id = 5 AND status = 'ACTIVE'` works, but `WHERE status = 'ACTIVE'` does not — without `tenant_id`, `status` values are scattered everywhere. When a range appears (`>`, `<`, `BETWEEN`, `LIKE 'abc%'`), positioning stops at that column. With `WHERE a = 1 AND b > 10 AND c = 'X'` on `INDEX (a,b,c)`, `a` positions exactly, `b` does a range scan, but `c` cannot position the tree because inside `b > 10`, `c` is not sorted. ICP can still filter `c` inside the leaves, but it is a filter, not a tree seek.

**Q: What is Index Condition Pushdown (ICP)?**

ICP, since MySQL 5.6, pushes filter evaluation down into the storage engine. Without it, InnoDB finds every secondary entry matching the part it can position (say `a = 1 AND b > 10`), hops to the clustered index for each, hands the full row to the server layer, and the server discards rows where `c = 'X'` fails — thousands of wasted hops. With ICP, InnoDB checks `c = 'X'` right in the secondary leaf before hopping. Failing entries are dropped early. In `EXPLAIN` you see `Using index condition` when this happens. It does not make the query covering, but it avoids most of the random I/O.

**Q: Why would MySQL ignore an index and do a Full Table Scan?**

The optimizer is cost-based. A secondary lookup is a random read to the clustered index per matching row. If selectivity is low — say `WHERE status = 'ACTIVE'` matches 85% of rows — doing hundreds of thousands of random hops is more expensive than a single sequential scan of the clustered table in large 16KB chunks. MySQL estimates this using sampled cardinality; if more than roughly 15–30% of rows would be visited via random hops and the query is not covering, it picks `type: ALL`. After bulk inserts or deletes, run `ANALYZE TABLE` if the plan seems stale.

**Q: Why should InnoDB primary keys be auto-incrementing integers instead of random UUIDs?**

Rows are physically ordered by the primary key. Monotonic `BIGINT AUTO_INCREMENT` appends new rows to the end of the last leaf page — pages fill near 100% and no splits happen. Random UUIDv4 inserts land at random leaf positions; when a 16KB page is full, InnoDB must split it — allocate a new page, move half the rows, update parent pointers, flush both pages. That means write amplification, half-empty pages (fragmentation), buffer pool thrashing, and every secondary index becomes larger because each leaf stores a 36-byte UUID instead of an 8-byte integer. If you need UUIDs for business reasons, use `BIGINT AUTO_INCREMENT` as the clustered PK with a `UNIQUE` index on the UUID, or use an ordered UUIDv7 whose high bits are a timestamp so inserts stay sequential.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Wrapping an indexed column in a function kills the index**

The B+Tree stores raw values, not function results. `WHERE YEAR(created_at) = 2024` cannot seek the tree — MySQL must scan every row. The fix is to keep the column sargable (Search ARGument Able).

```sql
-- Wrong: function on indexed column -> Full Table Scan
SELECT * FROM orders WHERE YEAR(created_at) = 2024;
SELECT * FROM orders WHERE id + 10 = 1000;

-- Right: range on raw column -> index seek
SELECT * FROM orders WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
SELECT * FROM orders WHERE id = 1000 - 10;

-- If you must query the expression, index a generated column
ALTER TABLE orders ADD COLUMN order_year INT GENERATED ALWAYS AS (YEAR(created_at)) STORED;
CREATE INDEX idx_order_year ON orders (order_year);
```

**Trap 2: Implicit type coercion silently disables the index**

If a `VARCHAR` column is compared to a number, MySQL casts every row's string to a number — a function on the column.

```sql
-- phone_number is VARCHAR(20) with INDEX(phone_number)
-- Wrong: numeric literal forces CAST(phone_number AS DOUBLE) per row
SELECT * FROM users WHERE phone_number = 9876543210;

-- Right: string literal matches column type, index is used
SELECT * FROM users WHERE phone_number = '9876543210';
```

Always pass the same type the column was defined with.

**Trap 3: Leading wildcards in LIKE**

B+Trees are sorted left to right. `LIKE 'John%'` is a range scan on prefix `John` — fast. `LIKE '%John'` or `LIKE '%John%'` has no known prefix, so the tree cannot be navigated and MySQL scans the whole table. For substring or trailing searches use `FULLTEXT` (`MATCH ... AGAINST`) or a reverse index (`CREATE INDEX idx_rev ON users(REVERSE(username))` and search the reversed string).

**Trap 4: Indexing a low-cardinality column and expecting it to help**

Adding an index on a boolean `is_active` or a `status` where 95% of rows are `COMPLETED` feels productive but often makes things slower. The index is not selective, the optimizer will usually ignore it for non-covering queries (choosing a table scan is cheaper than thousands of random hops), yet every write still pays to maintain the B+Tree, and `EXPLAIN` may show low `Cardinality` in `SHOW INDEX FROM`. Rule: index high-cardinality columns or, better, composite indexes that start with a selective column. If you must filter a common status, make it part of a composite like `(tenant_id, status, created_at)` where the leftmost column is selective, or use a partial/filtering strategy at the application level.

**Trap 5: Random UUIDv4 clustered primary key causes page splits**

```sql
-- Anti-pattern: random UUID as clustered PK
CREATE TABLE event_logs (
    id VARCHAR(36) NOT NULL, -- random UUIDv4 from app
    payload JSON,
    PRIMARY KEY (id)
);
```

Each insert lands at a random leaf, full 16KB pages split in half, fragmentation climbs, buffer pool churns.

```sql
-- Production pattern: auto-increment PK, unique UUID on the side
CREATE TABLE event_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_uuid CHAR(36) NOT NULL,
    payload JSON,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_uuid (event_uuid)
);

-- Or ordered UUIDv7 (time-ordered high bits) as BINARY(16) for sequential appends
CREATE TABLE event_logs_v7 (
    id BINARY(16) NOT NULL,
    payload JSON,
    PRIMARY KEY (id)
);
```

**Trap 6: Over-indexing — every index taxes writes**

Every extra index means each `INSERT` writes to `N+1` B+Trees, each `DELETE` removes from `N+1`, and updates to indexed columns rebalance trees. Locks are held longer, deadlocks rise, buffer pool is polluted with index pages, and storage can triple. Audit regularly:

```sql
SELECT object_schema, object_name, index_name
FROM sys.schema_unused_indexes WHERE object_schema = 'my_app';
SELECT * FROM sys.schema_redundant_indexes WHERE table_schema = 'my_app';
DROP INDEX idx_unused ON orders; -- remove what you no longer query
```

Aim for a handful of well-chosen composite and covering indexes instead of a dozen single-column ones.

**Trap 7: OR across different columns cannot use one index well**

```sql
-- Index on (customer_id, status) exists
-- This cannot seek one composite index for both sides
SELECT * FROM orders WHERE customer_id = 501 OR status = 'CANCELLED';
```

MySQL either does an `index_merge` (scanning two indexes and merging PK sets in CPU) or falls back to a table scan. Rewrite with `UNION ALL` so each branch uses its best index:

```sql
SELECT * FROM orders WHERE customer_id = 501
UNION ALL
SELECT * FROM orders WHERE status = 'CANCELLED' AND customer_id != 501;
```

## 7. Compare With Related Concepts

| Feature | Clustered Index (Primary Key) | Secondary B+Tree Index | Hash Index (MEMORY) | FULLTEXT Index |
| :--- | :--- | :--- | :--- | :--- |
| Physical storage | Leaves ARE the full rows | Leaves hold indexed key + PK | In-memory hash buckets with chains | Inverted index term → doc list |
| Count per table | Exactly 1 (InnoDB) | Many (keep to 3–6 well-chosen) | Many on MEMORY tables; InnoDB adaptive hash is automatic | Many where text search is needed |
| Lookup | `O(log N)` direct to row | `O(log N)` to PK → hop to clustered | `O(1)` for `=` | Tokenize → inverted list |
| Range `>`, `BETWEEN` | Optimal (linked leaf walk) | Optimal | Not supported (full scan) | Not supported |
| `ORDER BY` / `LIKE 'abc%'` | Sorted directly | Sorted for indexed columns | No order | By relevance rank |
| Overhead | Zero extra (data must live anyway) | Extra disk + buffer pool per index | Memory-heavy bucket array | Auxiliary token tables |

**Composite index vs multiple single-column indexes**

Multiple singles `INDEX(a), INDEX(b)` — MySQL typically picks only one per table access. `WHERE a = 1 AND b = 2` will use whichever is more selective and filter the other condition in memory, or do a costly `index_merge`. One composite `INDEX(a,b)` narrows with both columns in a single tree walk. Prefer a composite when columns are queried together, ordered leftmost selective first.

**Index Seek vs Index Scan vs Table Scan**

- Index Seek (`type: const`, `eq_ref`, `ref`, `range`) — walk root to leaf for specific keys, read only relevant pages. Fastest.
- Index Scan (`type: index`) — scan every page of a secondary index start to finish. Cheaper than `ALL` only if it is covering and the index is smaller than the table.
- Table Scan (`type: ALL`) — scan every page of the clustered table. Slowest for large tables, but the optimizer correctly chooses it when selectivity is too low for random hops to be worth it.

## 8. 🧠 The Memory Hook

The clustered index is the book itself ordered by primary key. Every secondary index is a thin bookmark in the back that stores the keyword plus the page number. If your query only needs what is written on the bookmark, you get `Using index` and never open the book — that is a covering index.
