# MySQL Indexing: B+Tree Internals, Clustered vs Secondary Indexes, and Query Optimization

## 1. Why This Exists — The Problem First

You push an e-commerce platform to production. During development with 500 mock records, every API endpoint responds in under 5 milliseconds. Six months later, your `orders` table grows to 50,000,000 rows. A customer loads their order history, triggering a standard query: `SELECT * FROM orders WHERE customer_id = 94812 AND status = 'COMPLETED' ORDER BY created_at DESC LIMIT 10;`.

Without an index on `customer_id`, MySQL has no mathematical or structural way of knowing where those 10 matching rows live on disk. It must execute a Full Table Scan (`type: ALL`). The database engine reads every single 16KB InnoDB disk page from physical storage into the InnoDB Buffer Pool in memory. That is more than 20 gigabytes of raw data streamed through storage I/O to answer a single query. The database server's CPU spikes to 100%, hot cached pages in RAM are evicted, database worker threads saturate the connection pool, and the query takes 45 seconds to finish. When 50 concurrent customers refresh their account pages, API gateway 504 timeouts cascade across your services, and the database grinds to a halt.

In a panic, an engineer adds an index to every single column in the table—creating 15 independent single-column indexes. Read latency improves slightly, but write throughput collapses. Every single `INSERT`, `UPDATE`, and `DELETE` must now synchronously modify 15 separate B+Tree index structures on disk inside transaction locks. Page splits cause severe storage fragmentation, write amplification spikes disk I/O, and write latency increases by 8x.

MySQL indexing exists to solve both extremes: transforming an $O(N)$ linear disk scan into an $O(\log N)$ tree traversal that locates target rows in 3 to 4 disk page reads, while providing the exact structural rules needed to optimize query access paths without degrading database write throughput.

## 2. The Analogy — Make It Obvious

Imagine a 2,000-page printed medical encyclopedia.

The Clustered Index is the physical book itself. The entire volume is printed, bound, and sorted in strict alphabetical order by Disease ID (the Primary Key). The complete description, symptoms, medications, and clinical notes live directly on those physical pages. Because physical paper can only be bound in one physical order at a time, a table can only ever have **one** Clustered Index.

A Secondary Index is like the "Index of Symptoms" printed in the back 20 pages of the encyclopedia. In this symptom index, entries are sorted alphabetically by symptom (e.g., "Abdominal Pain", "Chronic Cough", "Dizziness"). However, the symptom index does not reprint the full medical record. Next to "Chronic Cough", it simply lists a pointer back to the primary key: `Disease ID #4820 (Asthma)`.

The Secondary Lookup (Index Hop / Bookmark Lookup): When you search for "Chronic Cough", you flip to the symptom index in the back (step 1), find `Disease ID #4820`, and then flip open the main encyclopedia to page 740 where Disease #4820 is physically bound to read the full treatment (step 2). You had to perform two distinct lookups.

A Covering Index: Suppose the symptom index in the back lists: `"Chronic Cough" -> Severity: High, Disease ID #4820`. If a doctor only asks, "What is the severity of Chronic Cough?", you read "High" directly off the index page in the back. You never have to open the main book. You answered the query in a single lookup.

The B+Tree Structure: Imagine the encyclopedia library has a fast directory in the lobby. Sign 1 at the door says: "Letters A–H go to Floor 1, I–P go to Floor 2, Q–Z go to Floor 3" (Root Node). On Floor 2, a sign says "N–O go to Aisle 4" (Internal Node). In Aisle 4, all the books sit side-by-side on shelves, with a physical ribbon tying the end of Book 1 directly to the beginning of Book 2 (Leaf Node Linked List). If you need all diseases from "Nail Infection" to "Nosebleed", you walk to the shelf once and pull books sequentially along the ribbon without running back to the lobby.

## 3. How It Actually Works — The Full Explanation

MySQL's default storage engine, InnoDB, organizes all data using the B+Tree data structure. Understanding how B+Trees store and retrieve data explains why certain queries run in microseconds while others choke the database.

**Why B+Trees: High Fanout and Shallow Depth**

Databases are bottlenecked by disk I/O. Reading data from random disk locations (or even random RAM pages) is expensive. A database index must minimize the number of page reads required to locate a row.

In a standard Binary Search Tree (BST) or Red-Black Tree, every node has at most two children. Searching through 50,000,000 rows requires $\log_2(50,000,000) \approx 26$ node hops. If each hop reads a different page from disk, a single lookup costs 26 disk I/O operations.

InnoDB organizes all data in fixed-size blocks called Pages, which are 16KB (16,384 bytes) by default. A B+Tree is a self-balancing, multi-way search tree designed to maximize Fanout (the number of child pointers per page). 

An internal node in an InnoDB B+Tree stores only search keys and child page pointers. If a `BIGINT` primary key takes 8 bytes and a child page pointer takes 6 bytes, each key-pointer entry takes 14 bytes. Accounting for page headers, a single 16KB page can hold roughly 1,170 child pointers:
- Level 1 (Root Node): 1 page = 1,170 pointers to Level 2 pages.
- Level 2 (Internal Level): 1,170 pages $\times$ 1,170 pointers = 1,368,900 pointers to Leaf pages.
- Level 3 (Leaf Level): 1,368,900 leaf pages $\times$ 100 rows per page = 136,890,000 data rows.

With a tree height of only 3, InnoDB can store over 130 million rows. With a tree height of 4, it holds over 160 billion rows. Because the root page and intermediate levels are cached in the InnoDB Buffer Pool (RAM), finding any arbitrary row among 100 million records requires at most 1 physical disk read (or 0 if leaf pages are in RAM).

**B+Tree vs B-Tree and Hash Indexes**

Standard B-Trees store actual data records inside internal nodes as well as leaf nodes. Storing large data rows inside internal nodes drastically reduces fanout (from 1,170 pointers down to 15–20), which increases tree depth and requires more disk reads per lookup.

B+Trees store full data rows exclusively in leaf pages. Internal nodes store only keys and page pointers. Crucially, all leaf pages are connected in a doubly linked list (`PAGE_PREV` and `PAGE_NEXT` pointers in the page header). For range scans (`WHERE id BETWEEN 100 AND 500`), MySQL locates the first key in $O(\log N)$ time and then walks the linked list of leaf pages sequentially in memory without ever re-traversing the upper levels of the tree.

Hash Indexes provide $O(1)$ point lookups for exact matches (`WHERE id = 5`), but they are useless for range queries (`WHERE age > 21`), prefix searches (`LIKE 'abc%'`), sorting (`ORDER BY created_at`), or partial multi-column matching. B+Trees support all of these access patterns natively.

**Clustered Index vs Secondary Index in InnoDB**

In InnoDB, every table is an Index-Organized Table. The table data does not sit in a separate heap file; the table IS the Clustered Index:
1. Clustered Index (Primary Key): The leaf pages of the primary key B+Tree contain the complete, physical row data (all columns). Rows are physically ordered by the primary key.
   - If an explicit `PRIMARY KEY` is defined, InnoDB uses it as the clustered index.
   - If no primary key is defined, InnoDB selects the first `UNIQUE NOT NULL` column.
   - If neither exists, InnoDB creates a hidden 6-byte auto-increment row ID (`GEN_CLUST_INDEX`). This hidden index is shared globally across all unindexed tables, creating severe mutex contention under concurrent writes.
2. Secondary Index (Non-Clustered): Any index created on non-primary columns (e.g., `INDEX (email)`). The leaf pages of a secondary index do NOT contain data rows or disk offsets. They contain only the indexed column value and the corresponding Primary Key value.

**The Secondary Lookup (Index Hop / Table Refetch)**

When you run `SELECT name, phone FROM users WHERE email = 'alex@example.com';` with an index on `email`:
1. MySQL searches the `idx_email` secondary B+Tree to find the leaf containing `'alex@example.com'`.
2. It reads the associated Primary Key value stored in that leaf: `id = 7421`.
3. It performs a second B+Tree traversal on the Clustered Index using `id = 7421` to retrieve the complete row containing `name` and `phone`.

This secondary lookup step is called an Index Hop or Bookmark Lookup.

**Covering Index (`Using index`)**

If a query requests only columns that exist inside the secondary index itself (including the implicitly appended Primary Key), MySQL skips the clustered index traversal completely:

`SELECT id, email FROM users WHERE email = 'alex@example.com';`

Because both `email` (the indexed column) and `id` (the primary key) are stored directly inside the `idx_email` leaf page, MySQL resolves the query entirely within the secondary index. In `EXPLAIN` output, the `Extra` column displays `Using index`. Covering indexes eliminate secondary table refetches and provide dramatic speedups.

**Composite Indexes and the Leftmost Prefix Rule**

A composite index spans multiple columns, such as `INDEX (tenant_id, status, created_at)`.

InnoDB sorts the B+Tree first by `tenant_id`. Within identical `tenant_id` values, it sorts by `status`. Within identical `status` values, it sorts by `created_at`.

The Leftmost Prefix Rule states that MySQL can use a composite index only if the query filters start from the leftmost column and proceed continuously without gaps:
- `WHERE tenant_id = 5` -> Uses index (prefix: `tenant_id`).
- `WHERE tenant_id = 5 AND status = 'ACTIVE'` -> Uses index (prefix: `tenant_id, status`).
- `WHERE tenant_id = 5 AND status = 'ACTIVE' AND created_at > '2024-01-01'` -> Uses full index.
- `WHERE status = 'ACTIVE'` -> Cannot use index (leftmost column `tenant_id` is missing).
- `WHERE tenant_id = 5 AND created_at > '2024-01-01'` -> Uses index only for `tenant_id`; cannot use index for `created_at` search positioning because `status` is missing.

**Range Match Cutoff and Index Condition Pushdown (ICP)**

When a composite index encounters a range condition (`>`, `<`, `BETWEEN`, `LIKE 'abc%'`), index tree traversal stops using subsequent columns for tree search positioning. For example, in `INDEX (a, b, c)` with query `WHERE a = 1 AND b > 10 AND c = 'X'`:
- Column `a` is used for exact tree lookup.
- Column `b` is used for range tree lookup.
- Column `c` cannot be used for B+Tree positioning because within the range of `b > 10`, rows are not sorted by `c`.

However, MySQL uses Index Condition Pushdown (ICP). Instead of immediately hopping to the clustered index for every row matching `a = 1 AND b > 10`, the storage engine evaluates `c = 'X'` directly inside the secondary index leaf pages before fetching full rows from the clustered index. In `EXPLAIN`, this appears as `Using index condition`.

**Index Cardinality and Optimizer Statistics**

Cardinality represents the estimated number of unique values in an index column. High cardinality (e.g., UUID, email, user ID) means an index is highly selective. Low cardinality (e.g., boolean `is_active`, status `PENDING/COMPLETED` where 90% are `COMPLETED`) means the index has poor selectivity.

The MySQL Cost-Based Optimizer (CBO) decides whether to use an index by estimating I/O cost. If a query matches 30% of the rows in a table, using a secondary index requires thousands of random I/O index hops to the clustered table. In that scenario, the optimizer chooses a Full Table Scan because sequential disk reads are faster than hundreds of thousands of random page lookups.

InnoDB updates cardinality by randomly sampling index pages. If statistics become outdated after heavy bulk operations, running `ANALYZE TABLE <table_name>;` forces a re-sampling of index pages to correct the optimizer's cost model.

## 4. Real Code — See It Working

Let us create a production-grade order processing table, inspect execution plans using `EXPLAIN` and `EXPLAIN ANALYZE`, and observe how different index configurations change database behavior.

```sql
-- 1. Create a production table with primary, composite, and prefix indexes
CREATE TABLE orders (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tenant_id INT UNSIGNED NOT NULL,
    customer_id BIGINT UNSIGNED NOT NULL,
    order_number VARCHAR(64) NOT NULL,
    status ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    total_amount DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    customer_notes VARCHAR(1000) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_order_number (order_number),
    -- Composite index designed for multi-tenant customer filtering and date ordering
    KEY idx_tenant_customer_created (tenant_id, customer_id, created_at),
    -- Composite index for status workflows
    KEY idx_tenant_status (tenant_id, status),
    -- Prefix index on a long text column to conserve B+Tree page space
    KEY idx_notes_prefix (customer_notes(50))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert sample records
INSERT INTO orders (tenant_id, customer_id, order_number, status, total_amount, customer_notes, created_at)
VALUES 
(1, 101, 'ORD-2024-001', 'COMPLETED', 149.50, 'Leave package at front door please', '2024-01-15 10:00:00'),
(1, 101, 'ORD-2024-002', 'COMPLETED', 89.00, 'Ring the bell twice on arrival', '2024-02-10 14:30:00'),
(1, 102, 'ORD-2024-003', 'PENDING', 210.00, 'Call before delivery', '2024-02-12 09:15:00'),
(2, 201, 'ORD-2024-004', 'PROCESSING', 45.00, NULL, '2024-02-15 11:00:00');
```

Now let us analyze different query shapes and verify how the MySQL optimizer utilizes the indexes.

```sql
-- Scenario A: Non-covering secondary lookup (Requires Index Hop to Clustered Index)
-- Uses idx_tenant_customer_created to locate rows, then fetches total_amount from Clustered Index
EXPLAIN
SELECT id, total_amount 
FROM orders 
WHERE tenant_id = 1 AND customer_id = 101;

-- Output Analysis:
-- type: ref
-- key: idx_tenant_customer_created
-- key_len: 12 (tenant_id 4 bytes + customer_id 8 bytes)
-- ref: const,const
-- Extra: NULL (or Using index condition) -> Fetches row from Clustered Table to get total_amount
```

```sql
-- Scenario B: Covering Index (Zero Clustered Index Hops)
-- id is implicitly in the secondary index leaf; tenant_id, customer_id, created_at are explicit
EXPLAIN
SELECT id, created_at 
FROM orders 
WHERE tenant_id = 1 AND customer_id = 101 
ORDER BY created_at DESC;

-- Output Analysis:
-- type: ref
-- key: idx_tenant_customer_created
-- Extra: Using index -> Completely resolved inside secondary index leaf pages. No table lookup.
-- No 'Using filesort' because created_at is already sorted in the B+Tree!
```

```sql
-- Scenario C: Leftmost Prefix Violation
-- Skipping tenant_id means MySQL cannot use idx_tenant_customer_created
EXPLAIN
SELECT * 
FROM orders 
WHERE customer_id = 101;

-- Output Analysis:
-- type: ALL (Full Table Scan)
-- possible_keys: NULL
-- key: NULL
-- Rows scanned: Full table count. The index cannot be used because leftmost column is missing.
```

```sql
-- Scenario D: Prefix Index on long VARCHAR
-- Uses the first 50 characters of customer_notes for B+Tree lookup
EXPLAIN
SELECT id, order_number 
FROM orders 
WHERE customer_notes LIKE 'Leave package%';

-- Output Analysis:
-- type: range
-- key: idx_notes_prefix
-- key_len: 203 (50 characters * 4 bytes per utf8mb4 char + 2 prefix length bytes + 1 null byte)
-- Extra: Using index condition
```

```sql
-- Scenario E: Inspecting Cardinality and Refreshing Statistics
SHOW INDEX FROM orders;
-- Shows Column_name, Non_unique, Seq_in_index, Cardinality, Index_type (BTREE)

-- Recalculate optimizer statistics after bulk load
ANALYZE TABLE orders;
-- Recalculates page sample distributions in mysql.innodb_index_stats
```

## 5. The Interview Questions — All of Them, Done Properly

**Q: Why does MySQL InnoDB use B+Trees instead of standard B-Trees or Hash tables?**

InnoDB uses B+Trees primarily because of disk I/O economics. In a standard B-Tree, every node (including intermediate levels) stores full data rows alongside keys. Storing large rows inside intermediate nodes reduces the number of pointers per page (fanout) from over 1,000 down to 10–20. This forces the tree to grow deeper (6–10 levels), requiring 6–10 random disk reads per query.

In a B+Tree, internal nodes store only search keys and child page pointers. This maximizes page fanout, keeping tree depth at 3 to 4 levels even for billions of rows. Furthermore, B+Trees store full data rows exclusively in leaf pages, and all leaf pages are stitched together in a doubly linked list. This allows range queries (`WHERE date BETWEEN x AND y`) and sorted scans (`ORDER BY`) to locate the first key in $O(\log N)$ time and then stream sequential leaf pages in physical memory order without climbing back up the tree.

Hash tables are not used as primary indexes because hash buckets have no ordering. They provide $O(1)$ lookups for exact equality (`WHERE id = 10`), but cannot execute range scans (`WHERE id > 10`), prefix searches (`LIKE 'John%'`), sorting (`ORDER BY`), or partial composite key lookups.

**Q: What is the difference between a Clustered Index and a Secondary Index in InnoDB?**

In InnoDB, a table is structured as a Clustered Index. The leaf pages of the Clustered Index (built on the Primary Key) contain the actual physical table rows with all column values. The data is physically stored in primary key order. There can only be one clustered index per table.

A Secondary Index (any non-primary index) is a separate B+Tree where the leaf pages store only the indexed column values and the row's Primary Key value. When a query filters by a secondary index and requests columns not present in that index, MySQL performs an "Index Hop" (Bookmark Lookup): it traverses the secondary index to find the primary key, then traverses the clustered index to fetch the remaining columns.

**Q: What is a Covering Index, and how do you verify a query is using one?**

A Covering Index is an indexing strategy where all columns requested by a query (`SELECT`, `WHERE`, `JOIN`, `ORDER BY`, `GROUP BY`) exist entirely within the secondary index itself (including the primary key, which InnoDB automatically appends to every secondary index leaf).

When a query is covered, MySQL reads all required data directly from the secondary index leaf pages and completely skips the secondary lookup into the clustered index. You verify a covering index by running `EXPLAIN` on the query and checking the `Extra` column. If the `Extra` column displays `Using index`, the query is using a covering index.

**Q: What is the Leftmost Prefix Rule in composite indexes, and how does a range condition affect it?**

The Leftmost Prefix Rule dictates that a composite index on columns `(A, B, C)` can only be used by queries that filter on the leftmost column `A`, or `(A, B)`, or `(A, B, C)`. If a query filters on `B` and `C` without specifying `A`, the index cannot be used for B+Tree search because the index is sorted by `A` first; within `A`, it is sorted by `B`; and within `B`, it is sorted by `C`. Without fixing `A`, column `B` is not sorted globally.

When a query introduces a range condition (`>`, `<`, `BETWEEN`, `LIKE 'prefix%'`), the B+Tree can use the composite index for search positioning up to and including the first range column. Subsequent columns in the composite index cannot be used for B+Tree tree traversal because the sort order of subsequent columns is only guaranteed for exact equality matches on prior columns. For example, with `INDEX (dept_id, salary, hire_date)` and query `WHERE dept_id = 5 AND salary > 50000 AND hire_date > '2022-01-01'`: `dept_id` is used as an exact match, `salary` is used for range positioning, but `hire_date` cannot be used to navigate the tree.

**Q: Why should Primary Keys in InnoDB ideally be auto-incrementing integers rather than random UUIDs?**

InnoDB stores clustered index data physically ordered by the Primary Key. 

When you use monotonically increasing auto-incrementing integers (`BIGINT AUTO_INCREMENT`), new rows are sequentially appended to the end of the last 16KB leaf page in the clustered index. Pages fill up to near 100% capacity (or the default 15/16 page fill factor) smoothly without disturbing existing pages.

When you use random UUIDv4 strings as a primary key, each new insert hashes to an arbitrary location in the middle of the B+Tree. If the target 16KB leaf page is already full, InnoDB is forced to perform a B+Tree Page Split: it allocates a new page, moves 50% of the existing rows from the full page to the new page, updates parent page pointers, and flushes both pages to disk. This causes:
1. Massive write amplification and random disk I/O.
2. Severe storage fragmentation (pages remain ~50% empty).
3. Frequent eviction of active cache pages from the InnoDB Buffer Pool.
4. Bloated secondary indexes, because every secondary index leaf stores the full primary key (a 36-byte UUID string vs an 8-byte integer).

If UUIDs are required by business logic, you should use ordered UUIDs (such as UUIDv7) or store an auto-increment `BIGINT` as the clustered primary key while placing a `UNIQUE` secondary index on the UUID column.

**Q: What is Index Condition Pushdown (ICP) in MySQL?**

Index Condition Pushdown (ICP) is an optimization introduced in MySQL 5.6 for queries using secondary indexes. 

Without ICP, when a query has conditions on index columns that cannot be used for direct B+Tree traversal (such as columns appearing after a range operator), the storage engine fetches the Primary Key from the secondary index, performs an index hop to the Clustered Index to retrieve the full table row, and passes the row to the MySQL Server layer, which evaluates the remaining `WHERE` conditions.

With ICP, MySQL pushes the evaluation of indexable `WHERE` conditions down to the InnoDB storage engine level. InnoDB checks the condition directly against the secondary index leaf values before performing the clustered index lookup. If the condition fails, InnoDB discards the entry immediately, saving thousands of unnecessary clustered table lookups. In `EXPLAIN`, ICP is indicated by `Using index condition` in the `Extra` column.

**Q: Why would MySQL choose a Full Table Scan even when a valid index exists on the filtered column?**

The MySQL query optimizer is cost-based. It estimates the disk I/O and CPU cost of using an index versus scanning the entire table.

When a secondary index is used for a non-covering query, every matching row requires a random I/O hop to the clustered table. If the optimizer estimates that the query will match more than roughly 15% to 30% of the total rows in the table (such as filtering `WHERE status = 'ACTIVE'` when 85% of rows are active), doing millions of random page reads is significantly more expensive than sequentially scanning the entire clustered table into memory in large contiguous page blocks. When index selectivity is low, the optimizer intentionally chooses a Full Table Scan.

## 6. The Traps — What Goes Wrong

**Trap 1: Wrapping Indexed Columns in Functions or Mathematical Expressions**

When an indexed column is wrapped inside a SQL function or arithmetic expression in the `WHERE` clause, MySQL cannot use the B+Tree index. The B+Tree stores raw column values, not the computed output of functions.

```sql
-- WRONG: Invalidates the index on created_at (Causes Full Table Scan)
SELECT * FROM orders WHERE YEAR(created_at) = 2024;

-- WRONG: Arithmetic on column invalidates index
SELECT * FROM orders WHERE id + 10 = 1000;

-- CORRECT: Sargable (Search-Argument-Able) range query uses idx_created_at
SELECT * FROM orders 
WHERE created_at >= '2024-01-01 00:00:00' 
  AND created_at < '2025-01-01 00:00:00';

-- CORRECT: Isolate the column on one side of the operator
SELECT * FROM orders WHERE id = 1000 - 10;
```

If querying by a computed expression is mandatory, use a Generated Column with an index:
```sql
ALTER TABLE orders ADD COLUMN order_year INT GENERATED ALWAYS AS (YEAR(created_at)) STORED;
CREATE INDEX idx_order_year ON orders(order_year);
```

**Trap 2: Implicit Type Coercion Silently Disabling Indexes**

If the data type of the query parameter does not match the column data type, MySQL applies type conversion rules. When converting between strings and numbers, MySQL converts the string to a number. If a string column is queried with a numeric literal, MySQL applies the conversion function to every row in the column, destroying index usage.

```sql
-- Schema: phone_number is VARCHAR(20) with INDEX(phone_number)

-- WRONG: Numeric literal forces MySQL to execute CAST(phone_number AS DOUBLE) for all rows
-- Triggers a Full Table Scan across millions of rows!
SELECT * FROM users WHERE phone_number = 9876543210;

-- CORRECT: Pass string literals for VARCHAR columns
SELECT * FROM users WHERE phone_number = '9876543210';
```

**Trap 3: Leading Wildcards in LIKE Queries**

B+Trees are sorted lexicographically from left to right. An index on `VARCHAR` can find prefixes instantly because all matching prefixes sit contiguously on the same leaf pages. A leading wildcard means the prefix is unknown, making B+Tree navigation impossible.

```sql
-- USES INDEX: Range scan on prefix 'John'
SELECT * FROM users WHERE username LIKE 'John%';

-- TRAP: Leading wildcard causes Full Table Scan
SELECT * FROM users WHERE username LIKE '%John';

-- TRAP: Double wildcard causes Full Table Scan
SELECT * FROM users WHERE username LIKE '%John%';
```

If full substring searching is required, use a MySQL `FULLTEXT` index with `MATCH() AGAINST()`, a reverse string index (`REVERSE(username)` for trailing searches), or a dedicated search engine (Elasticsearch/Meilisearch).

**Trap 4: Random UUIDv4 Clustered Primary Keys Causing Page Splits**

Using random UUIDs generated by application code (`crypto.randomUUID()`) as an InnoDB Primary Key degrades write throughput as the table grows.

```sql
-- ANTI-PATTERN: Random UUID Primary Key
CREATE TABLE event_logs (
    id VARCHAR(36) NOT NULL, -- Random UUIDv4
    payload JSON,
    PRIMARY KEY (id)
);
```

Because UUIDv4 values are randomly distributed, consecutive inserts write to random 16KB pages across the multi-gigabyte table. When a page fills up, InnoDB splits the page in half (50% fragmentation). Buffer pool memory thrashing spikes as pages are constantly read from disk, split, and written back.

```sql
-- PRODUCTION PATTERN 1: Auto-increment primary key with unique UUID
CREATE TABLE event_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    event_uuid CHAR(36) NOT NULL,
    payload JSON,
    PRIMARY KEY (id),
    UNIQUE KEY uq_event_uuid (event_uuid)
);

-- PRODUCTION PATTERN 2: Time-ordered sequential UUID (UUIDv7)
-- UUIDv7 embeds a millisecond timestamp in the high bits, ensuring sequential B+Tree appends
CREATE TABLE event_logs_v7 (
    id BINARY(16) NOT NULL, -- Compact 16-byte UUIDv7
    payload JSON,
    PRIMARY KEY (id)
);
```

**Trap 5: Over-Indexing and Index Bloat (Write Amplification)**

Indexes are not free. Every additional index created on a table:
1. Adds write latency: Every `INSERT` must write to $N+1$ B+Trees; every `DELETE` removes entries from $N+1$ B+Trees; `UPDATE` statements modifying indexed columns re-balance trees.
2. Increases transaction lock hold times, raising deadlock frequency.
3. Consumes RAM in the InnoDB Buffer Pool, displacing hot table data pages.
4. Increases storage size—it is common for 10 redundant indexes to consume 3x more disk space than the actual table data.

Rule: Regularly audit unused and redundant indexes using `sys.schema_unused_indexes` and `sys.schema_redundant_indexes`.

```sql
-- Query MySQL sys schema to identify unused indexes in production
SELECT object_schema, object_name, index_name 
FROM sys.schema_unused_indexes 
WHERE object_schema = 'my_production_db';
```

**Trap 6: Misunderstanding OR Clauses Across Different Columns**

When a query connects two different columns using `OR`, MySQL cannot use a single composite index.

```sql
-- Index exists on (customer_id, status)
-- TRAP: Query cannot use idx_customer_status efficiently for the second condition
SELECT * FROM orders WHERE customer_id = 501 OR status = 'CANCELLED';
```

MySQL must either perform an `index_merge` (scanning two separate indexes and merging the row ID sets in memory, which is CPU-heavy) or fallback to a full table scan. If high-performance `OR` logic is needed, rewrite it using `UNION ALL`:

```sql
-- OPTIMIZED: Uses idx_customer_id for query 1 and idx_status for query 2
SELECT * FROM orders WHERE customer_id = 501
UNION ALL
SELECT * FROM orders WHERE status = 'CANCELLED' AND customer_id != 501;
```

## 7. Compare With Related Concepts

| Concept / Feature | Primary / Clustered Index | Secondary Index (B+Tree) | Hash Index | Full-Text Index (`FULLTEXT`) |
| :--- | :--- | :--- | :--- | :--- |
| **Physical Storage** | The leaf pages ARE the complete table rows | Leaf pages store indexed key + Primary Key | In-memory hash buckets with linked chains | Inverted index (term -> document list) |
| **Count Per Table** | Exactly 1 per InnoDB table | Multiple (recommended 3–5 per table) | Memory engine only (or Adaptive Hash Index) | Multiple |
| **Lookup Mechanism** | Direct $O(\log N)$ traversal to full data row | $O(\log N)$ traversal $\rightarrow$ Index Hop to Clustered Index | $O(1)$ exact key hash calculation | Tokenization $\rightarrow$ Inverted list lookup |
| **Range Queries (`>`, `BETWEEN`)** | Highly optimal (sequential leaf page walking) | Optimal (sequential leaf page walking) | Not supported ($O(N)$ scan required) | Not supported |
| **Sorting (`ORDER BY`)** | Direct hardware/memory sort order | Direct sort order for indexed columns | Not supported | By relevance score |
| **Memory / Disk Overhead** | Zero extra overhead (data must be stored anyway) | Extra disk and buffer pool RAM per index | Memory-intensive bucket arrays | Auxiliary inverted index tables |

**Composite Index vs Multiple Single-Column Indexes**
- Multiple Single-Column Indexes (`INDEX(a)`, `INDEX(b)`): MySQL generally chooses only ONE index per query table access. If you query `WHERE a = 1 AND b = 2`, MySQL picks whichever index has higher cardinality, reads the candidate rows, and filters `b = 2` in memory.
- Single Composite Index (`INDEX(a, b)`): MySQL uses both columns simultaneously during the B+Tree search, narrowing down to the exact matching rows in a single tree traversal. Always prefer a composite index when columns are queried together.

**Index Seek vs Index Scan vs Table Scan**
- Index Seek (`type: const`, `eq_ref`, `ref`, `range`): Navigates the B+Tree from root to leaf to find specific keys. Reads only relevant pages. High efficiency.
- Index Scan (`type: index`): Scans every page of a secondary index from start to finish. Reads all index pages without tree search positioning, but faster than `ALL` if index is covering because index pages are smaller than table pages.
- Table Scan (`type: ALL`): Scans every page of the clustered index table from first page to last page. Slowest access path for large tables.

## 8. 🧠 The Memory Hook — What Sticks

The Clustered Index is the physical book itself, ordered by Primary Key. Secondary Indexes are bookmarks in the back of the book that point to page numbers. If your query asks only for data written on the bookmark itself, you get a Covering Index and never have to open the heavy book.
