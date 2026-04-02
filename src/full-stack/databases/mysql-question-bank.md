# MySQL Interview Question Bank

A curated set of **50 most-asked MySQL interview questions** covering everything from foundational relational concepts to advanced performance tuning. Questions are grouped into thematic sections of five and each answer includes an explanation, idiomatic SQL, and an interview takeaway.

---

## Question Index

| # | Question | Group |
|---|----------|-------|
| 1 | What is a relational database and how does MySQL implement it? | Relational Fundamentals |
| 2 | What are the differences between `CHAR` and `VARCHAR`? | Relational Fundamentals |
| 3 | Explain primary key vs unique key vs composite key. | Relational Fundamentals |
| 4 | What are the normal forms (1NF–3NF/BCNF)? | Relational Fundamentals |
| 5 | What is referential integrity and how is it enforced in MySQL? | Relational Fundamentals |
| 6 | Explain `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`, and `FULL OUTER JOIN`. | Joins & Set Operations |
| 7 | What is a self-join and when would you use one? | Joins & Set Operations |
| 8 | What is the difference between `UNION` and `UNION ALL`? | Joins & Set Operations |
| 9 | How do correlated subqueries differ from regular subqueries? | Joins & Set Operations |
| 10 | When should you use a join vs a subquery? | Joins & Set Operations |
| 11 | What is an index and what types does MySQL support? | Indexing |
| 12 | How does a B-Tree index work internally? | Indexing |
| 13 | What is a covering index? | Indexing |
| 14 | What is index selectivity and why does it matter? | Indexing |
| 15 | When does MySQL NOT use an index? | Indexing |
| 16 | What are the ACID properties? | Transactions & ACID |
| 17 | Explain MySQL transaction isolation levels. | Transactions & ACID |
| 18 | What are dirty reads, non-repeatable reads, and phantom reads? | Transactions & ACID |
| 19 | How does MySQL handle deadlocks? | Transactions & ACID |
| 20 | What is the difference between optimistic and pessimistic locking? | Transactions & ACID |
| 21 | What is InnoDB and how does it differ from MyISAM? | InnoDB & Storage Engines |
| 22 | What is the InnoDB buffer pool? | InnoDB & Storage Engines |
| 23 | Explain InnoDB's MVCC (Multi-Version Concurrency Control). | InnoDB & Storage Engines |
| 24 | What are redo logs and undo logs in InnoDB? | InnoDB & Storage Engines |
| 25 | What is the clustered index in InnoDB? | InnoDB & Storage Engines |
| 26 | How does `EXPLAIN` work and what should you look for? | Query Optimization |
| 27 | What is the query execution order in MySQL? | Query Optimization |
| 28 | How do you optimize a slow `GROUP BY` query? | Query Optimization |
| 29 | What is query caching and why was it removed in MySQL 8? | Query Optimization |
| 30 | What are common causes of full table scans? | Query Optimization |
| 31 | What is database normalization vs denormalization? | Schema Design & Normalization |
| 32 | How would you model a many-to-many relationship? | Schema Design & Normalization |
| 33 | What is a surrogate key vs a natural key? | Schema Design & Normalization |
| 34 | What are the pros and cons of using NULLs? | Schema Design & Normalization |
| 35 | How do you design for soft deletes? | Schema Design & Normalization |
| 36 | What is MySQL replication and how does it work? | Replication & High Availability |
| 37 | What is GTID-based replication? | Replication & High Availability |
| 38 | What is the difference between synchronous and asynchronous replication? | Replication & High Availability |
| 39 | What is MySQL Group Replication / InnoDB Cluster? | Replication & High Availability |
| 40 | How do you take a consistent backup of a live MySQL database? | Replication & High Availability |
| 41 | What is table partitioning and what types does MySQL support? | Partitioning & Large Tables |
| 42 | What is partition pruning? | Partitioning & Large Tables |
| 43 | What are the trade-offs of horizontal partitioning vs sharding? | Partitioning & Large Tables |
| 44 | How do you archive old data efficiently? | Partitioning & Large Tables |
| 45 | How do you handle very large `ALTER TABLE` operations? | Partitioning & Large Tables |
| 46 | What is a view and when should you use one? | Views, Procedures & Triggers |
| 47 | What is a stored procedure vs a function? | Views, Procedures & Triggers |
| 48 | What are triggers and what are their pitfalls? | Views, Procedures & Triggers |
| 49 | What is an event scheduler in MySQL? | Views, Procedures & Triggers |
| 50 | What performance metrics and tools do you use to monitor MySQL? | Performance Tuning |

---

## Group 1 — Relational Fundamentals

### Q1. What is a relational database and how does MySQL implement it?

**Answer:** A relational database stores data in tables (relations) with rows and columns, enforcing relationships between tables through foreign keys. MySQL is an open-source RDBMS that uses SQL as its query language and InnoDB as its default storage engine.

**Details:**
- Tables, rows, and columns map to relations, tuples, and attributes in relational theory.
- Constraints (PK, FK, UNIQUE, CHECK) enforce the integrity rules of the relational model.
- MySQL 8.0+ adds window functions, CTEs, and full JSON support while staying ACID-compliant via InnoDB.

**Takeaway:** Know that MySQL separates the *server layer* (SQL parsing, optimiser) from the *storage engine layer*. This is why `MyISAM` and `InnoDB` can coexist.

---

### Q2. What are the differences between `CHAR` and `VARCHAR`?

**Answer:** `CHAR(n)` is fixed-length and always stores exactly *n* bytes (padded with spaces). `VARCHAR(n)` is variable-length and stores only the actual data plus 1–2 bytes for the length prefix.

**Details:**
- `CHAR` is slightly faster for fixed-width data (e.g., ISO country codes) because no length prefix is needed.
- `VARCHAR` saves space for variable-length strings but has a small overhead on reads/writes.
- Both respect the `utf8mb4` character set; `CHAR(10)` in `utf8mb4` can use up to 40 bytes.

```sql
CREATE TABLE users (
    country_code CHAR(2)    NOT NULL,  -- always 2 bytes
    username     VARCHAR(64) NOT NULL  -- 1–65 bytes
);
```

**Pitfall:** Comparing `CHAR` columns trims trailing spaces, which can mask bugs. Use `VARCHAR` unless the column width is truly fixed.

---

### Q3. Explain primary key vs unique key vs composite key.

**Answer:**
- **Primary Key (PK):** Uniquely identifies each row. One per table. Cannot be NULL. InnoDB creates a clustered index on it.
- **Unique Key:** Enforces uniqueness but allows a single NULL (multiple NULLs are also permitted in MySQL because NULL ≠ NULL).
- **Composite Key:** A PK or unique key made up of two or more columns.

```sql
CREATE TABLE orders (
    order_id   INT         NOT NULL AUTO_INCREMENT,
    user_id    INT         NOT NULL,
    product_id INT         NOT NULL,
    created_at DATETIME    NOT NULL,
    PRIMARY KEY (order_id),
    UNIQUE KEY uq_user_product (user_id, product_id)  -- composite unique
);
```

**Takeaway:** Composite PKs are common in junction tables. In InnoDB, every secondary index implicitly includes the PK columns, so a wide PK inflates all secondary indexes.

---

### Q4. What are the normal forms (1NF–3NF/BCNF)?

**Answer:**
| Form | Rule |
|------|------|
| 1NF | Atomic values; no repeating groups; each row uniquely identifiable |
| 2NF | 1NF + every non-key column fully depends on the *entire* PK |
| 3NF | 2NF + no transitive dependencies (non-key → non-key) |
| BCNF | 3NF + every determinant is a candidate key |

**Example of a 2NF violation:**
```sql
-- BAD: order_date depends only on order_id, not on (order_id, product_id)
CREATE TABLE order_items (
    order_id   INT,
    product_id INT,
    order_date DATE,  -- depends only on order_id → partial dependency
    quantity   INT
);
-- FIX: move order_date to an orders table
```

**Takeaway:** In practice, aim for 3NF. BCNF is theoretically stronger but can make some queries harder. Denormalise deliberately for performance, not by accident.

---

### Q5. What is referential integrity and how is it enforced in MySQL?

**Answer:** Referential integrity ensures that a foreign key value in a child table always references an existing row in the parent table. In MySQL/InnoDB this is enforced with `FOREIGN KEY` constraints.

```sql
CREATE TABLE orders (
    order_id INT PRIMARY KEY,
    user_id  INT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE RESTRICT
        ON UPDATE CASCADE
);
```

**ON DELETE / ON UPDATE actions:**
| Action | Behaviour |
|--------|-----------|
| `RESTRICT` | Reject the operation if child rows exist |
| `CASCADE` | Propagate delete/update to child rows |
| `SET NULL` | Set FK column to NULL in child rows |
| `NO ACTION` | Same as RESTRICT in MySQL |

**Pitfall:** MyISAM *parses* but *ignores* FK constraints. Always use InnoDB for tables that need referential integrity.

---

## Group 2 — Joins & Set Operations

### Q6. Explain `INNER JOIN`, `LEFT JOIN`, `RIGHT JOIN`, and `FULL OUTER JOIN`.

**Answer:**
| Join | Returns |
|------|---------|
| `INNER JOIN` | Rows with a match in **both** tables |
| `LEFT JOIN` | All rows from left + matching rows from right (NULL for no match) |
| `RIGHT JOIN` | All rows from right + matching rows from left |
| `FULL OUTER JOIN` | All rows from both; NULL where no match (MySQL uses `UNION`) |

```sql
-- LEFT JOIN example
SELECT u.name, o.order_id
FROM users u
LEFT JOIN orders o ON u.id = o.user_id;
-- Users with no orders appear with NULL order_id

-- FULL OUTER JOIN emulation in MySQL
SELECT u.name, o.order_id FROM users u LEFT  JOIN orders o ON u.id = o.user_id
UNION
SELECT u.name, o.order_id FROM users u RIGHT JOIN orders o ON u.id = o.user_id;
```

**Takeaway:** MySQL does not have a native `FULL OUTER JOIN` keyword — use `UNION` of a `LEFT` and `RIGHT` join.

---

### Q7. What is a self-join and when would you use one?

**Answer:** A self-join joins a table to itself. It is useful for hierarchical or comparative data stored in a single table.

```sql
-- Employee → Manager hierarchy stored in one table
SELECT e.name AS employee, m.name AS manager
FROM employees e
LEFT JOIN employees m ON e.manager_id = m.id;

-- Find pairs of products in the same category
SELECT a.name, b.name, a.category
FROM products a
JOIN products b ON a.category = b.category AND a.id < b.id;
```

**Takeaway:** Always use table aliases when self-joining, otherwise the query won't parse. The `a.id < b.id` trick avoids duplicate pairs.

---

### Q8. What is the difference between `UNION` and `UNION ALL`?

**Answer:**
- `UNION` deduplicates rows by sorting and comparing all columns — slower.
- `UNION ALL` returns all rows including duplicates — faster, preferable when duplicates are impossible or acceptable.

```sql
-- Returns distinct active users from two regions
SELECT id, name FROM users_eu
UNION
SELECT id, name FROM users_us;

-- Faster when IDs cannot overlap across regions
SELECT id, name FROM users_eu
UNION ALL
SELECT id, name FROM users_us;
```

**Pitfall:** `UNION` implicitly sorts results; never rely on that order without an explicit `ORDER BY` on the outer query.

---

### Q9. How do correlated subqueries differ from regular subqueries?

**Answer:** A **regular** (non-correlated) subquery executes once and its result is used by the outer query. A **correlated** subquery references columns from the outer query and re-executes for **each row** of the outer query — making it O(n) or worse.

```sql
-- Regular subquery (executes once)
SELECT name FROM products
WHERE category_id IN (SELECT id FROM categories WHERE active = 1);

-- Correlated subquery (executes per row — avoid for large tables)
SELECT name, price
FROM products p
WHERE price > (
    SELECT AVG(price) FROM products WHERE category_id = p.category_id
);
```

**Pitfall:** Correlated subqueries on large tables can be drastically slower than an equivalent `JOIN`. Use `EXPLAIN` to verify the execution plan.

---

### Q10. When should you use a join vs a subquery?

**Answer:** Prefer a **join** when you need columns from multiple tables in the result set. Use a **subquery** (or CTE) when you need to filter or aggregate before joining, or when the logic reads more clearly.

```sql
-- Join: fetching columns from both tables
SELECT u.name, o.total
FROM users u
JOIN orders o ON u.id = o.user_id;

-- Subquery/CTE: filter users who placed > 5 orders
WITH heavy_users AS (
    SELECT user_id FROM orders GROUP BY user_id HAVING COUNT(*) > 5
)
SELECT u.name FROM users u
JOIN heavy_users h ON u.id = h.user_id;
```

**Takeaway:** Modern MySQL's optimiser often rewrites `IN (subquery)` to a semi-join internally. Still, explicit joins are easier to read and optimise manually.

---

## Group 3 — Indexing

### Q11. What is an index and what types does MySQL support?

**Answer:** An index is a data structure that speeds up data retrieval at the cost of extra storage and slower writes.

| Type | Use case |
|------|----------|
| B-Tree (default) | Range queries, equality, `ORDER BY` |
| Hash | Exact-match only (MEMORY engine, NDB) |
| Full-Text | Natural-language text search |
| Spatial (R-Tree) | Geo / geometry data |
| Functional | Index on an expression, e.g., `LOWER(email)` |

```sql
CREATE INDEX idx_email       ON users (email);
CREATE FULLTEXT INDEX ft_bio ON users (bio);
CREATE INDEX idx_lower_email ON users ((LOWER(email)));  -- functional (MySQL 8+)
```

**Takeaway:** InnoDB always uses B-Tree indexes. Hash indexes are only available in the MEMORY engine or as an adaptive hash index (automatic, internal).

---

### Q12. How does a B-Tree index work internally?

**Answer:** A B-Tree (balanced tree) stores sorted key values in nodes. Each leaf node contains the key and a pointer to the row (or the row itself for a clustered index). Lookups traverse the tree from root to leaf in O(log n) time.

```
         [50]
        /    \
    [20,40]  [60,80]
    /  |  \    |   \
 [..][..][..]  [..] [..]  ← leaf nodes (sorted, linked)
```

- **Equality:** traverse root → leaf = O(log n)
- **Range:** find start leaf, scan linked leaf pages
- **ORDER BY:** often satisfies the sort using the index order

**Pitfall:** Indexes on low-cardinality columns (e.g., a boolean flag) are usually not used because a full scan is cheaper than random I/O.

---

### Q13. What is a covering index?

**Answer:** A covering index includes all columns needed by a query — the optimiser can answer the query entirely from the index without touching the table rows ("index-only scan").

```sql
-- Query: find active users' emails
SELECT email FROM users WHERE status = 'active';

-- Covering index: both columns are in the index
CREATE INDEX idx_status_email ON users (status, email);

-- EXPLAIN shows: Using index  ← no row lookup needed
EXPLAIN SELECT email FROM users WHERE status = 'active'\G
```

**Takeaway:** The column order in a composite index matters. Put equality-filter columns first, then range columns, then columns needed only for SELECT (so they are "included" without affecting the sort order).

---

### Q14. What is index selectivity and why does it matter?

**Answer:** Selectivity = `COUNT(DISTINCT col) / COUNT(*)`. A value close to 1.0 means the index is highly selective (each key points to few rows). Low-selectivity indexes (e.g., `gender`) are often skipped by the optimiser.

```sql
-- Check selectivity
SELECT
    COUNT(DISTINCT status) / COUNT(*) AS status_selectivity,
    COUNT(DISTINCT email)  / COUNT(*) AS email_selectivity
FROM users;
-- status: 0.002 (low) | email: 1.000 (high)
```

**Pitfall:** Even a highly selective index can be ignored if the query uses a function on the column: `WHERE YEAR(created_at) = 2024` prevents index use — use a range instead: `WHERE created_at BETWEEN '2024-01-01' AND '2024-12-31'`.

---

### Q15. When does MySQL NOT use an index?

**Answer:** The optimiser skips an index when:

1. **Function/expression wraps the column:** `WHERE LOWER(name) = 'alice'` — use a functional index.
2. **Leading wildcard:** `WHERE name LIKE '%alice'` — cannot seek in a B-Tree.
3. **Type mismatch:** comparing an `INT` column with a string literal causes implicit cast.
4. **Low selectivity / small table:** full scan is cheaper.
5. **`OR` across different columns** without a composite or multi-index.
6. **`!=` / `NOT IN`:** the optimiser usually scans.

```sql
-- Bad: full scan despite index on created_at
SELECT * FROM orders WHERE DATE(created_at) = '2024-06-01';

-- Good: range that can use the index
SELECT * FROM orders
WHERE created_at >= '2024-06-01' AND created_at < '2024-06-02';
```

**Takeaway:** Always run `EXPLAIN` after adding an index to confirm it is being used.

---

## Group 4 — Transactions & ACID

### Q16. What are the ACID properties?

**Answer:**
| Property | Meaning | MySQL mechanism |
|----------|---------|-----------------|
| **Atomicity** | All or nothing — a transaction either commits fully or rolls back entirely | Undo logs |
| **Consistency** | A transaction moves the DB from one valid state to another | Constraints + application logic |
| **Isolation** | Concurrent transactions don't see each other's intermediate state | MVCC + locks |
| **Durability** | Committed data survives crashes | Redo logs + `fsync` |

**Takeaway:** ACID is guaranteed by InnoDB. MyISAM only offers partial atomicity (statement-level) and no transaction support. Always use InnoDB for transactional workloads.

---

### Q17. Explain MySQL transaction isolation levels.

**Answer:** MySQL supports all four SQL standard isolation levels, configurable per session or globally.

| Level | Dirty Read | Non-Repeatable Read | Phantom Read |
|-------|-----------|--------------------|----|
| `READ UNCOMMITTED` | ✅ possible | ✅ possible | ✅ possible |
| `READ COMMITTED` | ❌ prevented | ✅ possible | ✅ possible |
| `REPEATABLE READ` (default) | ❌ | ❌ prevented | ⚠️ prevented by MVCC in InnoDB |
| `SERIALIZABLE` | ❌ | ❌ | ❌ prevented |

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1;
-- ... other operations
COMMIT;
```

**Takeaway:** InnoDB's `REPEATABLE READ` prevents phantom reads via MVCC (snapshot reads) and next-key locks (for locking reads). This is stronger than the SQL standard's definition of `REPEATABLE READ`.

---

### Q18. What are dirty reads, non-repeatable reads, and phantom reads?

**Answer:**
- **Dirty read:** Transaction A reads uncommitted data from Transaction B. If B rolls back, A has read data that never existed.
- **Non-repeatable read:** Transaction A reads a row, Transaction B updates and commits it, then A reads the same row again and gets a different value.
- **Phantom read:** Transaction A executes a range query twice; Transaction B inserts/deletes rows in that range between A's two reads, so A sees different rows.

```sql
-- Phantom read scenario (SERIALIZABLE prevents this)
-- Session A: SELECT COUNT(*) FROM orders WHERE status='pending'; → 10
-- Session B: INSERT INTO orders(status) VALUES('pending'); COMMIT;
-- Session A: SELECT COUNT(*) FROM orders WHERE status='pending'; → 11 (phantom)
```

**Takeaway:** These anomalies dictate which isolation level you need. Most OLTP applications are fine with `REPEATABLE READ`; analytics/reporting sometimes uses `READ COMMITTED` for better throughput.

---

### Q19. How does MySQL handle deadlocks?

**Answer:** InnoDB detects deadlocks (cycles in the wait-for graph) automatically and rolls back the transaction with the smallest undo log (cheapest to retry). The application receives `ERROR 1213 (40001): Deadlock found`.

```sql
-- Classic deadlock: two sessions lock rows in opposite order
-- Session A: UPDATE accounts SET bal = bal - 100 WHERE id = 1;
-- Session B: UPDATE accounts SET bal = bal - 100 WHERE id = 2;
-- Session A: UPDATE accounts SET bal = bal + 100 WHERE id = 2; -- waits for B
-- Session B: UPDATE accounts SET bal = bal + 100 WHERE id = 1; -- DEADLOCK
```

**Prevention tips:**
1. Always access tables/rows in the same order across transactions.
2. Keep transactions short.
3. Use `SELECT ... FOR UPDATE` early to acquire locks upfront.

**Takeaway:** Enable `innodb_print_all_deadlocks = ON` in development to log deadlock details to the error log for debugging.

---

### Q20. What is the difference between optimistic and pessimistic locking?

**Answer:**
- **Pessimistic locking:** Lock the row when reading it so no one else can modify it. Safe but reduces concurrency.
- **Optimistic locking:** Read without locking; include a version/timestamp column and check it has not changed at write time.

```sql
-- Pessimistic: SELECT ... FOR UPDATE
START TRANSACTION;
SELECT balance FROM accounts WHERE id = 1 FOR UPDATE;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
COMMIT;

-- Optimistic: version column
-- Read
SELECT balance, version FROM accounts WHERE id = 1;
-- Write only if version unchanged
UPDATE accounts
SET balance = balance - 100, version = version + 1
WHERE id = 1 AND version = :read_version;
-- If rows_affected = 0, retry
```

**Takeaway:** Optimistic locking shines when conflicts are rare (e.g., CMS content editing). Pessimistic locking is safer for high-contention resources like bank balances.

---

## Group 5 — InnoDB & Storage Engines

### Q21. What is InnoDB and how does it differ from MyISAM?

**Answer:** InnoDB is MySQL's default, ACID-compliant storage engine with row-level locking and MVCC. MyISAM is the legacy engine with table-level locking and no transaction support.

| Feature | InnoDB | MyISAM |
|---------|--------|--------|
| Transactions | ✅ | ❌ |
| Row-level locking | ✅ | ❌ (table lock) |
| Foreign keys | ✅ | ❌ |
| Crash recovery | ✅ (redo/undo) | ❌ (partial) |
| Full-text index | ✅ (5.6+) | ✅ |
| Clustered index | ✅ | ❌ |

**Takeaway:** MyISAM is still occasionally used for read-heavy, non-transactional data (e.g., logs, read-only reference tables) because `COUNT(*)` without a WHERE clause is O(1) in MyISAM (stored in header). Use InnoDB for everything else.

---

### Q22. What is the InnoDB buffer pool?

**Answer:** The buffer pool is InnoDB's main in-memory cache for both data pages and index pages. It is the most important tuning knob for InnoDB performance — typically set to 70–80% of available RAM.

```ini
# my.cnf
innodb_buffer_pool_size = 12G
innodb_buffer_pool_instances = 8   # one per ~1 GB for parallelism
```

**Internals:**
- Uses a modified LRU algorithm with "young" and "old" sub-lists to prevent large scans evicting hot pages.
- Dirty pages are flushed to disk asynchronously by background threads.
- `SHOW ENGINE INNODB STATUS` shows buffer pool hit rate — aim for > 99%.

**Takeaway:** If your entire working set fits in the buffer pool, disk I/O becomes rare and performance is excellent. Monitor `Innodb_buffer_pool_reads` vs `Innodb_buffer_pool_read_requests`.

---

### Q23. Explain InnoDB's MVCC (Multi-Version Concurrency Control).

**Answer:** MVCC allows readers and writers to not block each other. When a row is updated, InnoDB does not overwrite the original; it creates a new version and keeps the old one in the undo log. Each transaction sees a consistent snapshot based on its start time.

**How it works:**
1. Every row has hidden `DB_TRX_ID` (transaction that last modified it) and `DB_ROLL_PTR` (pointer to undo log) columns.
2. A `READ` statement (snapshot read) follows the undo log chain to find the row version visible to the current transaction's read view.
3. `SELECT ... FOR UPDATE` (locking read) always reads the latest committed version.

**Takeaway:** MVCC is why `REPEATABLE READ` in InnoDB is cheap — readers don't acquire row locks. This is also why long-running transactions bloat the undo log and hurt performance.

---

### Q24. What are redo logs and undo logs in InnoDB?

**Answer:**
| Log | Purpose | Location |
|-----|---------|----------|
| **Redo log** | Records *what changed* so committed changes can be replayed after a crash | `ib_logfile0/1` (or `#innodb_redo/` in MySQL 8.0.30+) |
| **Undo log** | Records *original values* before a change, enabling rollback and MVCC | System tablespace / undo tablespaces |

```
Write flow:
  1. Data page modified in buffer pool (dirty page)
  2. Change written to redo log (WAL — Write-Ahead Logging)
  3. Redo log flushed to disk (per innodb_flush_log_at_trx_commit setting)
  4. Dirty page eventually flushed to data file
```

**Pitfall:** `innodb_flush_log_at_trx_commit = 2` gives better write throughput but risks losing ~1 second of data on OS crash. Use `= 1` (default) for full durability.

---

### Q25. What is the clustered index in InnoDB?

**Answer:** In InnoDB, the primary key *is* the clustered index — the table data is physically stored in PK order within the B-Tree leaf pages. Every secondary index stores the PK value as a row pointer.

**Implications:**
- PK lookups are extremely fast (single B-Tree traversal, data at the leaf).
- Secondary index lookups require *two* B-Tree lookups: one on the secondary index to get the PK, then one on the clustered index to get the row.
- Inserting rows out of PK order causes page splits ("fragmentation") — use monotonically increasing PKs (e.g., `AUTO_INCREMENT` or `UUID_TO_BIN(UUID(), 1)` in MySQL 8).

```sql
-- UUID as PK hurts insert performance; use ordered UUIDs or AUTO_INCREMENT
CREATE TABLE sessions (
    id     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    token  CHAR(36) NOT NULL,
    UNIQUE KEY (token)
);
```

**Takeaway:** A wide PK (e.g., a composite of 3 INT columns) makes every secondary index significantly larger. Keep PKs small.

---

## Group 6 — Query Optimization

### Q26. How does `EXPLAIN` work and what should you look for?

**Answer:** `EXPLAIN` (and `EXPLAIN ANALYZE` in MySQL 8) shows the execution plan the optimiser chose.

```sql
EXPLAIN SELECT u.name, COUNT(o.id) AS total
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.status = 'active'
GROUP BY u.id\G
```

**Key columns:**
| Column | What to look for |
|--------|-----------------|
| `type` | `ALL` = full scan (bad); `ref`, `range`, `eq_ref` = index use (good) |
| `key` | Which index was chosen (`NULL` = no index) |
| `rows` | Estimated rows examined — minimise this |
| `Extra` | `Using filesort`, `Using temporary` are red flags |

**Takeaway:** `EXPLAIN ANALYZE` actually executes the query and shows real timings. Use it in development; never on production for expensive queries.

---

### Q27. What is the query execution order in MySQL?

**Answer:** SQL is written in one order but *evaluated* in a different logical order:

```
1. FROM / JOIN       -- identify and join tables
2. WHERE             -- filter rows
3. GROUP BY          -- group
4. HAVING            -- filter groups
5. SELECT            -- compute output columns / aliases
6. DISTINCT          -- remove duplicates
7. ORDER BY          -- sort
8. LIMIT / OFFSET    -- paginate
```

**Practical impact:**
- You **cannot** use a `SELECT` alias in a `WHERE` clause (WHERE runs before SELECT).
- You **can** use a `SELECT` alias in `ORDER BY` and `HAVING` (MySQL extension).

```sql
-- Error: alias 'total' not available in WHERE
SELECT SUM(amount) AS total FROM orders WHERE total > 100;  -- ❌

-- Correct
SELECT SUM(amount) AS total FROM orders GROUP BY user_id HAVING total > 100;  -- ✅
```

---

### Q28. How do you optimize a slow `GROUP BY` query?

**Answer:**
1. **Add a composite index** that covers the `WHERE` + `GROUP BY` columns to avoid `Using filesort` or `Using temporary`.
2. **Use covering indexes** so the engine never touches the table rows.
3. **Avoid `DISTINCT` inside aggregates** unless necessary.
4. **Use `SQL_BIG_RESULT`** hint to tell MySQL to use disk-based temp tables rather than trying in-memory sorts.

```sql
-- Slow: no index, filesort + temp table
SELECT category_id, COUNT(*) FROM products WHERE active = 1 GROUP BY category_id;

-- Add index
CREATE INDEX idx_active_cat ON products (active, category_id);

-- Verify
EXPLAIN SELECT category_id, COUNT(*) FROM products WHERE active = 1 GROUP BY category_id;
-- Extra: Using index  ← covering index, no row lookup
```

**Takeaway:** For GROUP BY to use an index, the GROUP BY columns must appear after the WHERE-equality columns in the index, in the same order.

---

### Q29. What is query caching and why was it removed in MySQL 8?

**Answer:** MySQL had a built-in query cache that stored the full result set of SELECT queries. On subsequent identical queries (byte-for-byte), it returned the cached result without executing.

**Why it was removed (MySQL 8.0):**
- The cache was invalidated on *any* write to a table, making it a bottleneck for write-heavy workloads.
- The mutex protecting the cache became a severe contention point at high concurrency.
- Benchmarks showed it hurt throughput in most real workloads.

**Modern alternatives:**
- Application-level caching (Redis, Memcached).
- ProxySQL or Vitess query result caching.
- InnoDB buffer pool (caches pages, not query results).

**Takeaway:** Do not enable `query_cache_type` on older MySQL versions for production. Plan for application-level caching from the start.

---

### Q30. What are common causes of full table scans?

**Answer:**
1. No index on the filtered column.
2. Function applied to an indexed column: `WHERE DATE(created_at) = ...`.
3. Leading `%` wildcard: `WHERE name LIKE '%foo'`.
4. Implicit type conversion: `WHERE int_col = '42'`.
5. `OR` conditions spanning columns without a union index.
6. Small table — optimiser prefers a scan over index overhead.
7. Statistics out of date — run `ANALYZE TABLE` to refresh them.

```sql
-- Force index to test (never leave in production)
SELECT * FROM orders FORCE INDEX (idx_status) WHERE status = 'pending';

-- Update statistics
ANALYZE TABLE orders;
```

**Takeaway:** Full scans on large tables are the #1 performance killer. Make `EXPLAIN` a habit before deploying any new query.

---

## Group 7 — Schema Design & Normalization

### Q31. What is database normalization vs denormalization?

**Answer:**
- **Normalization** removes redundancy by decomposing tables according to normal forms. Ensures data integrity and saves storage.
- **Denormalization** intentionally reintroduces redundancy (e.g., storing `category_name` in a `products` table alongside `category_id`) to reduce joins and improve read performance.

```sql
-- Normalized (join required to get category name)
SELECT p.name, c.name AS category
FROM products p JOIN categories c ON p.category_id = c.id;

-- Denormalized (category_name stored directly)
SELECT name, category_name FROM products;  -- one table, faster read
```

**Takeaway:** OLTP databases should be normalized (3NF) to minimise anomalies. Data warehouses/analytics often use denormalized star/snowflake schemas for query speed.

---

### Q32. How would you model a many-to-many relationship?

**Answer:** Use a **junction (bridge) table** with foreign keys to both parent tables.

```sql
CREATE TABLE students  (id INT PRIMARY KEY, name VARCHAR(100));
CREATE TABLE courses   (id INT PRIMARY KEY, title VARCHAR(100));

CREATE TABLE enrollments (
    student_id INT NOT NULL,
    course_id  INT NOT NULL,
    enrolled_at DATE NOT NULL,
    PRIMARY KEY (student_id, course_id),          -- composite PK
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id)  REFERENCES courses(id)  ON DELETE CASCADE
);

-- Add an index on course_id for lookups in the other direction
CREATE INDEX idx_course ON enrollments (course_id);
```

**Takeaway:** The junction table often grows its own attributes (e.g., `grade`, `enrolled_at`). Always index both FK columns individually in addition to the composite PK.

---

### Q33. What is a surrogate key vs a natural key?

**Answer:**
- **Natural key:** A column that exists in the domain and naturally identifies a row (e.g., `email`, `SSN`, `ISBN`).
- **Surrogate key:** A system-generated identifier with no business meaning (e.g., `AUTO_INCREMENT` INT or UUID).

| | Natural key | Surrogate key |
|-|------------|---------------|
| Stability | May change (email changes) | Never changes |
| Size | Often wide (string) | Small (INT) |
| Readability | Human-meaningful | Opaque |
| FK cost | String comparisons | Integer comparisons (fast) |

**Takeaway:** Prefer surrogate keys as PKs for InnoDB. Use natural keys as `UNIQUE` constraints to still enforce business rules.

---

### Q34. What are the pros and cons of using NULLs?

**Answer:**
- **Pros:** Represents genuine absence of a value without inventing a sentinel (e.g., `-1` or `''`).
- **Cons:**
  - Tri-value logic: `NULL = NULL` is `UNKNOWN`, not `TRUE` — use `IS NULL`.
  - Aggregate functions ignore NULLs (`AVG`, `SUM`, `COUNT(col)` vs `COUNT(*)`).
  - Indexes on nullable columns include NULL entries in MySQL but can still be used.
  - JOINs silently drop rows when NULLs appear in join keys.

```sql
-- Common NULL pitfall
SELECT * FROM users WHERE middle_name != 'Jr';
-- Rows where middle_name IS NULL are excluded silently!

-- Correct
SELECT * FROM users WHERE middle_name != 'Jr' OR middle_name IS NULL;
```

**Takeaway:** Use `NOT NULL` with a sensible default wherever possible. Reserve NULL for genuinely unknown/absent values.

---

### Q35. How do you design for soft deletes?

**Answer:** Soft deletes mark rows as deleted rather than physically removing them, preserving history and enabling recovery.

```sql
ALTER TABLE users ADD COLUMN deleted_at DATETIME NULL DEFAULT NULL;

-- Soft delete
UPDATE users SET deleted_at = NOW() WHERE id = 42;

-- Typical query filters
SELECT * FROM users WHERE deleted_at IS NULL;

-- Partial index to keep active-user queries fast
CREATE INDEX idx_active_users ON users (deleted_at, id);
-- Or a generated column + index for cleaner queries
ALTER TABLE users ADD COLUMN is_deleted TINYINT(1) GENERATED ALWAYS AS (deleted_at IS NOT NULL) STORED;
CREATE INDEX idx_not_deleted ON users (is_deleted);
```

**Pitfall:** Unique constraints on soft-deleted tables break because a "deleted" email and a new row with the same email both satisfy the constraint. Use partial unique indexes (not natively supported in MySQL — handle in application or via triggers).

---

## Group 8 — Replication & High Availability

### Q36. What is MySQL replication and how does it work?

**Answer:** MySQL replication asynchronously copies changes from a **source** (primary) to one or more **replicas** (secondaries) using the **binary log (binlog)**.

**Flow:**
1. Source writes changes to the binlog.
2. Replica's **I/O thread** connects to the source and copies binlog events to its **relay log**.
3. Replica's **SQL thread** (or parallel applier threads) replays relay log events on the replica.

```sql
-- On source
SHOW MASTER STATUS;  -- get binlog file and position

-- On replica
CHANGE REPLICATION SOURCE TO
    SOURCE_HOST = '10.0.0.1',
    SOURCE_USER = 'repl',
    SOURCE_PASSWORD = 'secret',
    SOURCE_LOG_FILE = 'binlog.000001',
    SOURCE_LOG_POS  = 4;
START REPLICA;
SHOW REPLICA STATUS\G
```

**Takeaway:** Binlog format options — `STATEMENT` (default before 5.7), `ROW` (exact row images, safest), `MIXED`. Use `ROW` format for most production setups.

---

### Q37. What is GTID-based replication?

**Answer:** Global Transaction Identifiers (GTIDs) assign a unique ID (`source_uuid:transaction_id`) to every committed transaction. Replicas use GTIDs instead of binlog file/position to track progress, making failover much simpler.

```sql
-- Enable (my.cnf)
gtid_mode = ON
enforce_gtid_consistency = ON

-- Check on source
SELECT @@GLOBAL.gtid_executed;

-- Set up replica (no file/position needed)
CHANGE REPLICATION SOURCE TO
    SOURCE_HOST = '10.0.0.1',
    SOURCE_USER = 'repl',
    SOURCE_PASSWORD = 'secret',
    SOURCE_AUTO_POSITION = 1;
START REPLICA;
```

**Takeaway:** GTID replication makes promoting a new primary trivial — the new primary and other replicas automatically resync without manual position calculation. Required for MHA, Orchestrator, and InnoDB Cluster.

---

### Q38. What is the difference between synchronous and asynchronous replication?

**Answer:**
| Type | Behaviour | Durability | Throughput |
|------|-----------|-----------|-----------|
| **Asynchronous** | Source commits without waiting for replica acknowledgement | ⚠️ Data can lag/be lost on failover | High |
| **Semi-synchronous** | Source waits for *at least one* replica to write the relay log before committing | Better (relay log, not applied) | Medium |
| **Synchronous** | All nodes must commit before the transaction returns | ✅ No data loss | Lower |

MySQL's built-in replication is **asynchronous** (default) or **semi-synchronous** (via plugin). True synchronous replication is provided by **MySQL Group Replication** (Paxos-based) or Galera Cluster.

**Takeaway:** For RPO = 0 (no data loss), use Group Replication or a synchronous-write solution like InnoDB Cluster with `consistencyLevel = BEFORE_ON_PRIMARY_FAILOVER`.

---

### Q39. What is MySQL Group Replication / InnoDB Cluster?

**Answer:** **MySQL Group Replication (GR)** is a built-in plugin that implements a multi-master, virtually synchronous replication using the Paxos consensus protocol. Writes are certified across all members before commit.

**InnoDB Cluster** = Group Replication + MySQL Shell + MySQL Router for a complete HA solution.

```
[App] → [MySQL Router] → [Primary]
                        ↕  (GR)
                      [Secondary 1]
                      [Secondary 2]
```

- Automatic primary election on failure.
- Single-primary (default) or multi-primary mode.
- `mysql_innodb_cluster_metadata` tracks topology.

**Takeaway:** Group Replication is the modern standard for HA without third-party tools. Understand the difference between single-primary (reads/writes to one node) and multi-primary (all nodes accept writes, higher conflict risk).

---

### Q40. How do you take a consistent backup of a live MySQL database?

**Answer:**
| Tool | Method | Notes |
|------|--------|-------|
| `mysqldump` | Logical (SQL dump) | Slow on large DBs; uses `--single-transaction` for InnoDB consistency |
| `mysqlpump` | Parallel logical dump | Faster than `mysqldump` |
| `MySQL Enterprise Backup` / `XtraBackup` | Physical (file copy) | Hot backup, fast restore |
| Snapshot (LVM/EBS) | OS-level | Very fast; need to flush+lock first |

```bash
# Consistent logical backup (InnoDB, no table lock)
mysqldump --single-transaction --master-data=2 \
          --databases myapp > backup.sql

# XtraBackup (physical, hot)
xtrabackup --backup --target-dir=/backups/full
xtrabackup --prepare --target-dir=/backups/full
```

**Takeaway:** `--single-transaction` starts a consistent read transaction before dumping — it is safe for InnoDB tables. Always include `--master-data=2` to record the binlog position for PITR.

---

## Group 9 — Partitioning & Large Tables

### Q41. What is table partitioning and what types does MySQL support?

**Answer:** Partitioning splits a large table into smaller physical pieces (partitions) stored separately, while the table still looks like a single object to the application.

| Type | Split by |
|------|---------|
| `RANGE` | Column value ranges (e.g., year) |
| `LIST` | Explicit value lists (e.g., region codes) |
| `HASH` | Modulo of a column (uniform distribution) |
| `KEY` | Like HASH but uses MySQL's internal hashing |
| `RANGE COLUMNS` / `LIST COLUMNS` | Multiple columns |

```sql
CREATE TABLE logs (
    id         BIGINT NOT NULL AUTO_INCREMENT,
    created_at DATE   NOT NULL,
    message    TEXT,
    PRIMARY KEY (id, created_at)  -- partition key must be in PK
) PARTITION BY RANGE (YEAR(created_at)) (
    PARTITION p2022 VALUES LESS THAN (2023),
    PARTITION p2023 VALUES LESS THAN (2024),
    PARTITION p2024 VALUES LESS THAN (2025),
    PARTITION pmax  VALUES LESS THAN MAXVALUE
);
```

**Takeaway:** MySQL requires the partition key to be part of every unique index, including the PK — a common gotcha when retrofitting partitioning.

---

### Q42. What is partition pruning?

**Answer:** Partition pruning is the optimiser's ability to skip irrelevant partitions when a query filters on the partition key, reading only the partitions that can contain matching rows.

```sql
-- Only scans p2023 partition
SELECT * FROM logs WHERE created_at BETWEEN '2023-01-01' AND '2023-12-31';

-- Verify with EXPLAIN
EXPLAIN SELECT * FROM logs WHERE created_at = '2023-06-15'\G
-- partitions: p2023  ← pruning worked
```

**Conditions for pruning:**
- The `WHERE` clause must reference the partition key.
- The comparison must allow the optimiser to statically determine the partition set.
- Using a function on the partition key (e.g., `MONTH(created_at)`) may prevent pruning.

**Takeaway:** Partitioning without pruning-friendly queries is storage overhead without read benefit. Design your partitioning scheme around your most common query predicates.

---

### Q43. What are the trade-offs of horizontal partitioning vs sharding?

**Answer:**
| | Partitioning | Sharding |
|-|-------------|---------|
| Location | Single server, multiple files | Multiple servers |
| Transparency | Fully transparent to the app | Requires routing logic |
| Max scale | Limited by single server I/O | Scales horizontally |
| Complexity | Low | High |
| Cross-shard queries | N/A | Expensive / not possible |

**Sharding approaches:**
- **Range sharding:** shard by user_id range. Risk: hotspots.
- **Hash sharding:** consistent hashing for uniform distribution. Hard to re-shard.
- **Directory sharding:** lookup table maps keys to shards. Flexible but lookup is a bottleneck.

**Takeaway:** Exhaust vertical scaling and partitioning before sharding. Sharding introduces distributed-systems complexity (cross-shard transactions, migrations) that is very hard to undo.

---

### Q44. How do you archive old data efficiently?

**Answer:**
1. **Partition-based archival:** `ALTER TABLE logs DROP PARTITION p2022;` — instant, no row-by-row delete.
2. **Batch delete:** delete in small batches with `LIMIT` and `SLEEP()` to avoid locking.
3. **Archive table:** copy to a compressed/separate table then delete.

```sql
-- Safe batch delete (avoids long-running lock)
DELETE FROM events
WHERE created_at < '2022-01-01'
LIMIT 1000;
-- Repeat in a loop with application-level sleep

-- Better with partitioning (instant)
ALTER TABLE events DROP PARTITION p2021;
```

**Pitfall:** A single `DELETE FROM large_table WHERE created_at < '2022-01-01'` can lock the table for minutes, spike replication lag, and bloat the undo log. Always batch.

---

### Q45. How do you handle very large `ALTER TABLE` operations?

**Answer:** MySQL `ALTER TABLE` can lock or block reads/writes for the duration on large tables. Strategies:

1. **`ALGORITHM=INPLACE, LOCK=NONE`** (Online DDL) — MySQL 5.6+ for many operations.
2. **`pt-online-schema-change` (pt-osc):** Percona tool that creates a shadow table, copies data in chunks, uses triggers to sync changes.
3. **`gh-ost` (GitHub):** Triggerless OSC using binlog replication — lower overhead.

```sql
-- Online DDL (check if operation supports it)
ALTER TABLE orders
    ADD COLUMN notes TEXT,
    ALGORITHM=INPLACE, LOCK=NONE;

-- If not possible online, use gh-ost:
-- gh-ost --host=primary --database=myapp --table=orders \
--        --alter="ADD COLUMN notes TEXT" --execute
```

**Takeaway:** Always test DDL on a replica or staging environment first. For critical tables, `gh-ost` is the safest option because it can be paused and throttled.

---

## Group 10 — Views, Procedures, Triggers & Performance Tuning

### Q46. What is a view and when should you use one?

**Answer:** A view is a named, stored `SELECT` query. It acts like a virtual table and simplifies complex queries.

```sql
CREATE VIEW active_user_summary AS
SELECT
    u.id,
    u.name,
    COUNT(o.id)    AS order_count,
    SUM(o.total)   AS lifetime_value
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.deleted_at IS NULL
GROUP BY u.id, u.name;

-- Usage
SELECT * FROM active_user_summary WHERE lifetime_value > 500;
```

**Use views for:**
- Encapsulating complex joins for reuse.
- Access control (grant SELECT on view, not base tables).
- Abstracting schema changes from the application.

**Pitfall:** Views are not materialised in MySQL (unlike PostgreSQL). Every query against a view executes the underlying SELECT. Complex views can hurt performance. Use CTEs or application-layer caching for hot paths.

---

### Q47. What is a stored procedure vs a function?

**Answer:**
| | Stored Procedure | Stored Function |
|-|-----------------|----------------|
| Called with | `CALL proc()` | `SELECT func()` |
| Returns | Result sets + OUT params | A single scalar value |
| Can use in SQL | No | Yes (in SELECT, WHERE) |
| Transaction control | `COMMIT`, `ROLLBACK` allowed | Not allowed |

```sql
-- Function
DELIMITER $$
CREATE FUNCTION get_discount(price DECIMAL(10,2)) RETURNS DECIMAL(10,2)
DETERMINISTIC
BEGIN
    RETURN price * 0.9;
END$$
DELIMITER ;
SELECT get_discount(100.00);  -- 90.00

-- Procedure
DELIMITER $$
CREATE PROCEDURE transfer_funds(IN from_id INT, IN to_id INT, IN amount DECIMAL(10,2))
BEGIN
    START TRANSACTION;
    UPDATE accounts SET balance = balance - amount WHERE id = from_id;
    UPDATE accounts SET balance = balance + amount WHERE id = to_id;
    COMMIT;
END$$
DELIMITER ;
CALL transfer_funds(1, 2, 50.00);
```

**Takeaway:** Store business logic in the application tier when possible. Use procedures for batch jobs and functions for computed columns.

---

### Q48. What are triggers and what are their pitfalls?

**Answer:** A trigger is code that automatically fires `BEFORE` or `AFTER` an `INSERT`, `UPDATE`, or `DELETE` on a table.

```sql
DELIMITER $$
CREATE TRIGGER audit_salary_change
AFTER UPDATE ON employees
FOR EACH ROW
BEGIN
    IF OLD.salary != NEW.salary THEN
        INSERT INTO salary_audit (emp_id, old_salary, new_salary, changed_at)
        VALUES (NEW.id, OLD.salary, NEW.salary, NOW());
    END IF;
END$$
DELIMITER ;
```

**Pitfalls:**
- **Hidden performance cost:** every affected row fires the trigger; can dramatically slow bulk loads.
- **Cascading triggers** are hard to debug and reason about.
- **Replication:** `ROW`-format binlog replicates row changes, not trigger re-execution. `STATEMENT`-format replays triggers on the replica.
- **No transactions inside a `BEFORE` trigger** for the current row.

**Takeaway:** Use triggers sparingly. Prefer application-level logic or CDC (Change Data Capture) tools like Debezium for audit trails.

---

### Q49. What is an event scheduler in MySQL?

**Answer:** The MySQL Event Scheduler runs stored SQL code on a schedule — like a database-native cron job.

```sql
-- Enable
SET GLOBAL event_scheduler = ON;

-- Create a recurring event
DELIMITER $$
CREATE EVENT purge_old_sessions
ON SCHEDULE EVERY 1 HOUR
STARTS '2024-01-01 00:00:00'
DO BEGIN
    DELETE FROM sessions WHERE expires_at < NOW() LIMIT 10000;
END$$
DELIMITER ;

-- View events
SHOW EVENTS FROM myapp;
```

**Use cases:** periodic cleanup, summary table refresh, expiring tokens.

**Pitfall:** Events run on a single server. If you have a replica set, disable the scheduler on replicas (`SET GLOBAL event_scheduler = OFF`) to avoid double execution. Use `DO NOT REPLICATE` (`SET SESSION sql_log_bin = 0`) inside the event body for non-idempotent operations.

---

### Q50. What performance metrics and tools do you use to monitor MySQL?

**Answer:**

**Key metrics to monitor:**
| Metric | Why |
|--------|-----|
| `Questions` per second (QPS) | Traffic volume |
| `Threads_connected` / `Threads_running` | Concurrency level |
| `Innodb_buffer_pool_read_requests` vs `_reads` | Buffer pool hit rate |
| `Slow_queries` | Queries exceeding `long_query_time` |
| `Innodb_row_lock_waits` | Lock contention |
| Replication lag (`Seconds_Behind_Source`) | HA health |

**Tools:**
- **`SHOW STATUS`** / **`SHOW ENGINE INNODB STATUS`** — quick diagnostics.
- **Performance Schema** (`performance_schema.*`) — detailed instrumentation.
- **Slow Query Log** (`slow_query_log = 1`, `long_query_time = 1`) + `pt-query-digest`.
- **`sys` schema** — user-friendly views on Performance Schema data.
- **Prometheus + MySQL Exporter + Grafana** — production dashboards.

```sql
-- Top 5 slowest queries via sys schema
SELECT query, exec_count, avg_latency
FROM sys.statement_analysis
ORDER BY avg_latency DESC
LIMIT 5;

-- Current lock waits
SELECT * FROM sys.innodb_lock_waits\G
```

**Takeaway:** Enable the slow query log from day one in production. Regularly run `pt-query-digest` on the log to surface the top offenders before users complain.
