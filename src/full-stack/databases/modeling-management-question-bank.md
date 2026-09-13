# Database Modeling & Management — Interview Question Bank

A focused, interview-ready reference covering the 50 most commonly asked database modeling and management questions. Topics span ER modeling, normalization, schema design, indexing, sharding, replication, migrations, backups, and operational management.

---

## Question Index

| # | Question | Group |
|---|----------|-------|
| 1 | What is an Entity-Relationship (ER) model and how do you use it? | ER Modeling |
| 2 | What is the difference between a strong entity and a weak entity? | ER Modeling |
| 3 | How do you handle many-to-many relationships in a relational database? | ER Modeling |
| 4 | What are cardinality and participation constraints? | ER Modeling |
| 5 | When would you choose a composite entity over a direct foreign key? | ER Modeling |
| 6 | What is database normalization and why does it matter? | Normalization |
| 7 | Explain 1NF, 2NF, and 3NF with examples. | Normalization |
| 8 | What is Boyce-Codd Normal Form (BCNF)? | Normalization |
| 9 | What are 4NF and 5NF, and when do they apply? | Normalization |
| 10 | What is denormalization and when is it a good trade-off? | Normalization |
| 11 | What is a primary key and how does it differ from a unique key? | Keys & Constraints |
| 12 | What are foreign keys and how do cascade options work? | Keys & Constraints |
| 13 | What is a composite key and when should you use one? | Keys & Constraints |
| 14 | What are CHECK, NOT NULL, and DEFAULT constraints used for? | Keys & Constraints |
| 15 | What is a surrogate key versus a natural key? | Keys & Constraints |
| 16 | What is an index and how does a B-tree index work? | Indexing Strategy |
| 17 | What is the difference between a clustered and a non-clustered index? | Indexing Strategy |
| 18 | What are covering indexes and when should you use them? | Indexing Strategy |
| 19 | When do indexes hurt performance rather than help? | Indexing Strategy |
| 20 | What is a partial index and a function-based index? | Indexing Strategy |
| 21 | How do you approach query tuning in a relational database? | Query Tuning |
| 22 | What does EXPLAIN / EXPLAIN ANALYZE tell you? | Query Tuning |
| 23 | What are common causes of slow queries? | Query Tuning |
| 24 | What is the N+1 query problem and how do you fix it? | Query Tuning |
| 25 | How do you optimize a query that uses multiple JOINs? | Query Tuning |
| 26 | What are read/write patterns and why do they drive schema design? | Read/Write Patterns |
| 27 | What is CQRS and how does it relate to database design? | Read/Write Patterns |
| 28 | How do you design a schema for a write-heavy workload? | Read/Write Patterns |
| 29 | How do you design a schema for a read-heavy workload? | Read/Write Patterns |
| 30 | What is eventual consistency and when is it acceptable? | Read/Write Patterns |
| 31 | What is horizontal partitioning (sharding) and why is it used? | Sharding & Partitioning |
| 32 | What are the main sharding strategies? | Sharding & Partitioning |
| 33 | What is vertical partitioning? | Sharding & Partitioning |
| 34 | What is table partitioning (range, list, hash)? | Sharding & Partitioning |
| 35 | What are the operational challenges of sharding? | Sharding & Partitioning |
| 36 | What is database replication and what are its types? | Replication & HA |
| 37 | What is the difference between synchronous and asynchronous replication? | Replication & HA |
| 38 | What is a read replica and what workloads does it serve? | Replication & HA |
| 39 | How do you achieve high availability (HA) for a database? | Replication & HA |
| 40 | What is the CAP theorem and how does it apply to database choices? | Replication & HA |
| 41 | What is schema migration and how do you do it safely? | Schema Evolution |
| 42 | What is the expand-contract pattern for zero-downtime migrations? | Schema Evolution |
| 43 | How do you rename a column without downtime? | Schema Evolution |
| 44 | What are the risks of adding NOT NULL columns to large tables? | Schema Evolution |
| 45 | How do you manage migration scripts in a team environment? | Schema Evolution |
| 46 | What backup strategies exist for production databases? | Backups & Recovery |
| 47 | What is point-in-time recovery (PITR)? | Backups & Recovery |
| 48 | What is RTO and RPO and why do they matter for backup strategy? | Backups & Recovery |
| 49 | How do you test database backups? | Backups & Recovery |
| 50 | What are common database operational metrics to monitor? | Backups & Recovery |

---

## Group 1 — ER Modeling

---

### Q1. What is an Entity-Relationship (ER) model and how do you use it?

**Summary:** An ER model is a visual blueprint of the data domain that identifies entities (things), attributes (properties), and relationships (associations) before writing any CREATE TABLE statements.

**Details:**
- **Entities** map to tables. **Attributes** map to columns. **Relationships** map to foreign keys or junction tables.
- Drawn as rectangles (entities), ellipses (attributes), and diamonds (relationships).
- The model drives discussion with stakeholders before code is written, surfacing assumptions early.
- After agreement, the logical ER model is translated into a physical schema with data types, keys, and indexes.

**Example sketch:**
```
[Customer] --(places)--> [Order] --(contains)--> [Product]
  |                          |
  PK: customer_id            PK: order_id
  name, email                order_date, total
                             FK: customer_id
```

**Interview takeaway:** Start every non-trivial schema design with an ER diagram. Interviewers want to see that you think before you code. Explain entities vs. value objects — a phone number may be an attribute or an entity depending on business rules.

---

### Q2. What is the difference between a strong entity and a weak entity?

**Summary:** A **strong entity** has its own primary key and exists independently. A **weak entity** cannot be uniquely identified without borrowing a key from a related strong entity (its *owner*).

**Details:**
- Weak entities have a **partial key** that is only unique within the context of their owner.
- In SQL, the weak entity's PK is a composite key: `(owner_fk, partial_key)`.
- Common example: `OrderItem` is weak — it depends on `Order`. `(order_id, line_item_number)` is the composite PK.

**Example SQL:**
```sql
CREATE TABLE orders (
  order_id   INT PRIMARY KEY,
  order_date DATE NOT NULL
);

CREATE TABLE order_items (
  order_id     INT  NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  line_no      INT  NOT NULL,
  product_id   INT  NOT NULL,
  qty          INT  NOT NULL,
  PRIMARY KEY (order_id, line_no)
);
```

**Pitfall:** Assigning a surrogate PK to a weak entity (e.g., `item_id SERIAL`) is common and valid in practice, but you must still enforce the identifying relationship via the foreign key.

---

### Q3. How do you handle many-to-many relationships in a relational database?

**Summary:** Use a **junction table** (also called an associative or bridge table) that holds the foreign keys of both sides, forming two one-to-many relationships.

**Details:**
- The junction table's PK is typically composite: `(fk_a, fk_b)`.
- Add a surrogate key only if the junction itself needs to be referenced from elsewhere.
- Extra attributes on the relationship (e.g., enrollment date, quantity) live in the junction table.

**Example SQL:**
```sql
CREATE TABLE students  (student_id INT PRIMARY KEY, name TEXT);
CREATE TABLE courses   (course_id  INT PRIMARY KEY, title TEXT);

CREATE TABLE enrollments (
  student_id    INT  NOT NULL REFERENCES students(student_id),
  course_id     INT  NOT NULL REFERENCES courses(course_id),
  enrolled_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  grade         CHAR(2),
  PRIMARY KEY (student_id, course_id)
);
```

**Pitfall:** Forgetting to index the reverse direction (`course_id`) in the junction table — queries that filter by course will do full table scans without it.

---

### Q4. What are cardinality and participation constraints?

**Summary:**
- **Cardinality** defines how many instances of one entity relate to instances of another (1:1, 1:N, M:N).
- **Participation** defines whether every entity instance *must* participate (total) or *may* participate (partial) in a relationship.

**Details:**
- Total participation is enforced with `NOT NULL` foreign keys or, for complex cases, triggers.
- Partial participation allows NULLable foreign keys.
- Example: An `Employee` *must* belong to a `Department` (total participation → FK NOT NULL), but a `Department` may have no employees yet (partial participation → no constraint on `departments`).

**Example SQL:**
```sql
CREATE TABLE departments (dept_id INT PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE employees (
  emp_id   INT  PRIMARY KEY,
  name     TEXT NOT NULL,
  dept_id  INT  NOT NULL REFERENCES departments(dept_id)  -- total participation
);
```

**Interview takeaway:** Knowing cardinality constraints helps you decide nullable vs. not-null FKs without trial and error.

---

### Q5. When would you choose a composite entity over a direct foreign key?

**Summary:** Use a composite (junction) entity when the relationship itself has **attributes** or when it needs to be **referenced by other tables**.

**Details:**
- A direct FK (1:N with no extra data) needs no extra table.
- The moment you need to store *when*, *how much*, or *what role* a relationship represents, promote it to a full entity.
- Also promote when the relationship needs its own lifecycle (e.g., an `Enrollment` can be approved, waitlisted, dropped).

**Example — role-bearing relationship:**
```sql
-- Project-Employee assignment with a role attribute
CREATE TABLE assignments (
  assignment_id  SERIAL PRIMARY KEY,
  project_id     INT NOT NULL REFERENCES projects(project_id),
  employee_id    INT NOT NULL REFERENCES employees(emp_id),
  role           TEXT NOT NULL,
  start_date     DATE NOT NULL,
  UNIQUE (project_id, employee_id)
);
```

**Pitfall:** Leaving attributes on the relationship modeled as columns in one of the parent tables breaks 2NF — attributes that depend on only part of the key.

---

## Group 2 — Normalization

---

### Q6. What is database normalization and why does it matter?

**Summary:** Normalization is the process of structuring a relational schema to reduce **data redundancy** and improve **data integrity** by organizing data according to formal normal forms (NF).

**Details:**
- Redundancy leads to **update anomalies** (changing one copy but not another), **insert anomalies** (can't record a fact without unrelated data), and **delete anomalies** (losing a fact when deleting another).
- Normal forms are cumulative: 3NF implies 2NF implies 1NF.
- OLTP schemas should generally target at least 3NF. OLAP/reporting schemas often intentionally denormalize for query speed.

**Pitfall:** Over-normalizing a read-heavy schema incurs expensive multi-table JOINs. Normalization is a starting point, not an absolute rule.

---

### Q7. Explain 1NF, 2NF, and 3NF with examples.

**Summary:**
- **1NF:** Atomic column values; no repeating groups; each row uniquely identifiable.
- **2NF:** 1NF + every non-key attribute fully depends on the *entire* primary key (eliminates partial dependencies in composite-key tables).
- **3NF:** 2NF + no non-key attribute depends on another non-key attribute (eliminates transitive dependencies).

**Example — moving from unnormalized to 3NF:**
```sql
-- Unnormalized: repeating groups, mixed concerns
-- order_id | customer_name | customer_city | product1 | product2

-- 1NF: atomic values, one row per order-line
-- order_id | customer_id | product_id | qty

-- 2NF: customer data depends only on customer_id, not (order_id, product_id)
-- orders(order_id, customer_id, order_date)
-- order_items(order_id, product_id, qty)
-- customers(customer_id, customer_name, customer_city)

-- 3NF: if customer_city depends on zip_code (not customer_id), extract it
-- customers(customer_id, customer_name, zip_code)
-- zip_codes(zip_code, city, state)
```

**Interview takeaway:** Draw functional dependency (FD) arrows to spot violations quickly during whiteboard exercises.

---

### Q8. What is Boyce-Codd Normal Form (BCNF)?

**Summary:** BCNF is a stricter version of 3NF. A table is in BCNF if for every non-trivial functional dependency `X → Y`, `X` is a **superkey**.

**Details:**
- 3NF allows a dependency where the determinant is not a superkey, as long as the dependent attribute is part of a candidate key. BCNF removes that exception.
- Most tables in 3NF are also in BCNF. Violations only arise with **overlapping composite candidate keys**.

**Classic BCNF violation example:**
```
Students(student, subject, teacher)
  - A teacher teaches only one subject: teacher → subject
  - A student has one teacher per subject: (student, subject) → teacher
  Candidate keys: (student, subject), (student, teacher)
  teacher → subject violates BCNF because teacher is NOT a superkey.

Fix: decompose into
  TeacherSubject(teacher, subject)
  StudentTeacher(student, teacher)
```

**Pitfall:** BCNF decomposition can lose some functional dependencies, making it impossible to enforce certain constraints via keys alone — you may need triggers or application logic.

---

### Q9. What are 4NF and 5NF, and when do they apply?

**Summary:**
- **4NF:** Eliminates **multi-valued dependencies** — when one attribute independently determines multiple values of two other attributes.
- **5NF (Project-Join NF):** Eliminates **join dependencies** — a table can't be decomposed into smaller tables that re-join to produce the original without spurious tuples.

**Details:**
- 4NF example: `Employee(emp, skill, language)` — if skills and languages are independent of each other, split into `EmployeeSkill(emp, skill)` and `EmployeeLanguage(emp, language)`.
- 5NF is rarely encountered in practice and applies to very complex many-way relationships.

**Interview takeaway:** Know the concepts and give examples. Note that they're rarely applied in production schemas beyond academic or extremely complex M:N:P relationship scenarios.

---

### Q10. What is denormalization and when is it a good trade-off?

**Summary:** Denormalization intentionally introduces redundancy into a schema to improve **read performance** at the cost of increased storage and write complexity.

**Details:**
- **Common techniques:** pre-joined columns, materialized aggregates, duplicate columns, embedding related data (in NoSQL).
- **When to denormalize:**
  - Reporting/analytics queries join too many tables and are slow.
  - Hot read paths benefit from a single-table lookup.
  - The write rate is low, so maintaining redundant copies is acceptable.
- Always maintain redundant data via application logic, triggers, or materialized views.

**Example:**
```sql
-- Normalized: orders → customers JOIN to get customer_name
-- Denormalized: store customer_name on the orders row at insert time
-- (acceptable because an order is a historical snapshot)
ALTER TABLE orders ADD COLUMN customer_name TEXT;
```

**Pitfall:** Denormalizing write-heavy tables causes update anomalies. Profile first, denormalize second; always measure the impact.

---

## Group 3 — Keys & Constraints

---

### Q11. What is a primary key and how does it differ from a unique key?

**Summary:** A **primary key** uniquely identifies every row and is the table's canonical identifier — it is NOT NULL by definition and there can be only one per table. A **unique key** also enforces uniqueness but allows NULL values (in most databases) and multiple unique constraints per table.

**Details:**
- PKs are the default target for foreign key references.
- Unique constraints model alternate keys (candidate keys not chosen as PK).
- NULL semantics differ: a unique index typically allows multiple NULL rows (each NULL is distinct).

**Example SQL:**
```sql
CREATE TABLE users (
  user_id   SERIAL      PRIMARY KEY,          -- PK: not null, unique, one per table
  email     TEXT        NOT NULL UNIQUE,       -- alternate key
  username  TEXT        NOT NULL UNIQUE
);
```

**Pitfall:** Confusing unique constraints with unique indexes — they are often implemented the same way internally, but unique constraints are declarative business rules; indexes are a performance mechanism.

---

### Q12. What are foreign keys and how do cascade options work?

**Summary:** A **foreign key** enforces **referential integrity** — a value in the child table's FK column must exist as a PK in the parent table (or be NULL if allowed).

**Cascade options (ON DELETE / ON UPDATE):**
| Option | Behavior |
|--------|----------|
| `CASCADE` | Propagate delete/update to child rows |
| `SET NULL` | Set child FK to NULL |
| `SET DEFAULT` | Set child FK to its default value |
| `RESTRICT` | Reject the parent change if children exist |
| `NO ACTION` | Same as RESTRICT (evaluated at end of transaction) |

**Example SQL:**
```sql
CREATE TABLE orders (
  order_id    INT PRIMARY KEY,
  customer_id INT NOT NULL REFERENCES customers(customer_id) ON DELETE RESTRICT
);

CREATE TABLE order_items (
  order_id  INT NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
  line_no   INT NOT NULL,
  PRIMARY KEY (order_id, line_no)
);
```

**Pitfall:** `CASCADE` deletes are silent and powerful — a single `DELETE FROM customers` can wipe thousands of related rows. Use `RESTRICT` for business-critical data and handle cleanup explicitly in application code.

---

### Q13. What is a composite key and when should you use one?

**Summary:** A **composite key** is a primary or unique key made of two or more columns. Use it when no single column uniquely identifies a row but a combination of columns does.

**Details:**
- Natural for junction tables: `(order_id, product_id)`.
- Natural when identity is inherently compound: `(country_code, phone_number)`.
- Composite PKs become the target of child FKs — every child table must carry all component columns, which can bloat schemas. A surrogate key avoids this.

**Example SQL:**
```sql
CREATE TABLE role_assignments (
  user_id    INT NOT NULL REFERENCES users(user_id),
  role_id    INT NOT NULL REFERENCES roles(role_id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role_id)
);
```

**Interview takeaway:** Composite keys communicate intent clearly but carry FK propagation costs. Choose based on whether other tables need to reference this relationship directly.

---

### Q14. What are CHECK, NOT NULL, and DEFAULT constraints used for?

**Summary:** These column-level constraints encode business rules directly in the database, ensuring data validity regardless of which application layer writes data.

| Constraint | Purpose |
|------------|---------|
| `NOT NULL` | Prevents missing values for mandatory attributes |
| `DEFAULT` | Provides a fallback value when none is supplied |
| `CHECK` | Enforces a Boolean condition on the column value |

**Example SQL:**
```sql
CREATE TABLE products (
  product_id   SERIAL PRIMARY KEY,
  name         TEXT    NOT NULL,
  price        NUMERIC(10,2) NOT NULL CHECK (price > 0),
  status       TEXT    NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'active', 'archived')),
  stock_qty    INT     NOT NULL DEFAULT 0 CHECK (stock_qty >= 0)
);
```

**Pitfall:** CHECK constraints are not enforced across rows — for cross-row rules (e.g., "start_date < end_date across related rows"), you need triggers or exclusion constraints (PostgreSQL).

---

### Q15. What is a surrogate key versus a natural key?

**Summary:**
- A **natural key** is a column (or columns) with real-world meaning that uniquely identifies a row (e.g., SSN, email, ISBN).
- A **surrogate key** is a system-generated identifier with no business meaning (e.g., `SERIAL`, `UUID`).

**Trade-offs:**

| Concern | Natural Key | Surrogate Key |
|---------|-------------|---------------|
| Readability | High | Low (opaque) |
| Stability | Low (emails change) | High (never changes) |
| FK size | Can be wide/string | Typically small integer |
| Uniqueness | Must validate externally | Guaranteed by generation |

**Recommendation:** Use surrogate keys as PKs for FK targets; add a unique constraint on the natural key to preserve business rule enforcement.

```sql
CREATE TABLE customers (
  customer_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- surrogate
  email       TEXT NOT NULL UNIQUE                          -- natural, still enforced
);
```

**Pitfall:** Using natural keys that turn out to be mutable (e.g., username) or non-unique in practice causes cascading FK updates across the schema.

---

## Group 4 — Indexing Strategy

---

### Q16. What is an index and how does a B-tree index work?

**Summary:** An **index** is a data structure that allows the database to locate rows matching a predicate without scanning the entire table. A **B-tree** (balanced tree) is the default index type in most relational databases.

**Details:**
- B-tree stores keys in sorted order across balanced leaf pages linked in a doubly-linked list.
- Supports equality (`=`), range (`<`, `>`, `BETWEEN`), and `ORDER BY` without a separate sort step.
- Tree height is `O(log n)`, giving predictable seek time even with billions of rows.
- Each leaf page entry points to the heap (table) row by physical location.

**Example SQL:**
```sql
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_date     ON orders(order_date DESC);
```

**Pitfall:** An index is a copy of (part of) the table data. Every write (INSERT/UPDATE/DELETE) must also update all relevant indexes — too many indexes on a write-heavy table is a performance problem.

---

### Q17. What is the difference between a clustered and a non-clustered index?

**Summary:**
- A **clustered index** dictates the physical storage order of table rows. There can be only one per table. In SQL Server / MySQL InnoDB, the PK is the clustered index.
- A **non-clustered index** is a separate structure containing the indexed key(s) plus a pointer back to the actual row; the table rows are stored independently.

**Details:**
- Range scans on the clustered index key are very fast — data is physically adjacent.
- Non-clustered index lookups may require a **key lookup** (second access to the actual row) for columns not in the index.
- PostgreSQL doesn't have a persistent clustered index — all heap rows are unordered; `CLUSTER` physically reorders once but is not maintained automatically.

**Interview takeaway:** In InnoDB, choose the PK for your most common range-scan column (e.g., `account_id` for tenant data). Secondary indexes carry the PK value as a row locator — keep the PK small.

---

### Q18. What are covering indexes and when should you use them?

**Summary:** A **covering index** includes all columns referenced in a query (SELECT, WHERE, ORDER BY, GROUP BY), allowing the database to answer the query entirely from the index without touching the table heap.

**Details:**
- Avoids the extra "heap fetch" (random I/O) that typically follows a non-clustered index seek.
- Defined using `INCLUDE` (SQL Server, PostgreSQL) to add non-key columns without affecting sort order.
- Best for high-frequency read queries where the heap fetch is measurably expensive.

**Example SQL:**
```sql
-- Query: SELECT name, email FROM users WHERE status = 'active' AND created_at > '2024-01-01'
CREATE INDEX idx_users_active_cover
  ON users (status, created_at)
  INCLUDE (name, email);      -- PostgreSQL / SQL Server syntax
```

**Pitfall:** Over-wide covering indexes inflate storage and slow writes. Identify the top 5–10 hot queries and add covering indexes only for those.

---

### Q19. When do indexes hurt performance rather than help?

**Summary:** Indexes hurt when the **write overhead outweighs the read benefit**, or when **selectivity is too low** for the optimizer to prefer them.

**Details:**
- **Low selectivity:** An index on a boolean column (true/false) with a 50/50 split is nearly useless — a full scan is cheaper than following millions of index pointers.
- **Write-heavy tables:** Bulk INSERT/batch UPDATE must maintain every index on the table.
- **Unused indexes:** Every index occupies storage and slows writes even if never used. Audit with `pg_stat_user_indexes` (PostgreSQL) or `sys.dm_db_index_usage_stats` (SQL Server).
- **Small tables:** The optimizer picks a sequential scan for tables fitting in a few pages regardless of indexes.

**Pitfall:** Adding an index "just in case" without measuring — track index usage statistics regularly and drop indexes with zero scans.

---

### Q20. What is a partial index and a function-based index?

**Summary:**
- A **partial index** indexes only rows matching a WHERE condition, reducing its size and keeping it highly selective.
- A **function-based index** (expression index) indexes the result of a function or expression rather than a raw column value.

**Example SQL:**
```sql
-- Partial index: only index pending orders (ignores completed historical orders)
CREATE INDEX idx_orders_pending
  ON orders (customer_id, created_at)
  WHERE status = 'pending';

-- Expression index: enable case-insensitive email lookup
CREATE INDEX idx_users_email_lower
  ON users (lower(email));

-- Query that uses the expression index:
SELECT * FROM users WHERE lower(email) = lower('User@Example.com');
```

**Pitfall:** A function-based index is only used if the query predicate exactly matches the indexed expression — `WHERE email = 'user@example.com'` will NOT use a `lower(email)` index.

---

## Group 5 — Query Tuning

---

### Q21. How do you approach query tuning in a relational database?

**Summary:** Follow a systematic process: **measure → profile → identify bottleneck → fix → re-measure**. Never guess.

**Steps:**
1. Capture slow queries (slow query log, `pg_stat_statements`, APM tool).
2. Run `EXPLAIN (ANALYZE, BUFFERS)` to see the execution plan, actual row counts, and I/O.
3. Identify the most expensive node (highest cost, most rows, most buffers).
4. Check statistics currency (`ANALYZE` the table if stats are stale).
5. Consider adding/modifying indexes, rewriting the query, or schema changes.
6. Re-run `EXPLAIN ANALYZE` to confirm improvement.

**Common fixes:**
- Add an index for a sequential scan on a large table.
- Rewrite a correlated subquery as a JOIN.
- Push a filter earlier in the query (predicate pushdown).
- Switch from `OFFSET` pagination to keyset (cursor) pagination.

**Pitfall:** Tuning in development against a tiny dataset — always tune against production-scale data or a close copy.

---

### Q22. What does EXPLAIN / EXPLAIN ANALYZE tell you?

**Summary:** `EXPLAIN` shows the **estimated execution plan** (cost, row estimates). `EXPLAIN ANALYZE` actually executes the query and shows **actual runtime statistics** (rows, loops, time, buffers).

**Key nodes to recognize:**

| Node | Meaning |
|------|---------|
| `Seq Scan` | Full table scan — potential bottleneck on large tables |
| `Index Scan` | B-tree lookup + heap fetch |
| `Index Only Scan` | Covered by index; no heap fetch |
| `Hash Join` | Build hash table on smaller side; probe with larger |
| `Nested Loop` | Good for small inner sets; bad for large inner sets |
| `Sort` | In-memory or disk sort — check `work_mem` |

**Example:**
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT o.order_id, c.name
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
WHERE o.status = 'pending';
```

**Pitfall:** `EXPLAIN` without ANALYZE uses estimated row counts which can be wildly wrong if statistics are stale — always use ANALYZE for real tuning decisions.

---

### Q23. What are common causes of slow queries?

**Summary:** The most frequent culprits are missing indexes, stale statistics, implicit type casts, N+1 patterns, and non-SARGable predicates.

**Checklist:**
| Cause | Symptom | Fix |
|-------|---------|-----|
| Missing index | Seq Scan on large table | Add selective index |
| Stale statistics | Estimated 1 row, actual 1M | `ANALYZE` table |
| Implicit cast | Index on `INT`, predicate uses `TEXT` | Match data types |
| SELECT * | Fetches unnecessary columns | List explicit columns |
| OFFSET pagination | Full scan to skip N rows | Keyset pagination |
| Non-SARGable predicate | `WHERE YEAR(date) = 2024` | `WHERE date >= '2024-01-01' AND date < '2025-01-01'` |
| Lock contention | Query blocks, waits | Shorten transactions; use SKIP LOCKED |

**Interview takeaway:** A non-SARGable predicate wraps the column in a function, preventing index use — this is one of the most common performance gotchas.

---

### Q24. What is the N+1 query problem and how do you fix it?

**Summary:** The **N+1 problem** occurs when code fetches a list of N parent records and then issues one additional query per record to fetch related data — resulting in N+1 database round trips.

**Example (bad):**
```python
orders = db.query("SELECT * FROM orders LIMIT 100")   # 1 query
for order in orders:
    order.customer = db.query(                          # 100 more queries!
        "SELECT * FROM customers WHERE customer_id = ?", order.customer_id
    )
```

**Fixes:**
1. **JOIN** — fetch orders and customers in a single query.
2. **Batch load (IN clause)** — collect all customer IDs, fetch in one `WHERE customer_id IN (...)`.
3. **ORM eager loading** — `include`/`with`/`joinedload` in your ORM.
4. **Dataloader pattern** — batch and deduplicate in GraphQL contexts.

```sql
-- Fix: single JOIN query
SELECT o.order_id, o.order_date, c.name AS customer_name
FROM orders o
JOIN customers c ON c.customer_id = o.customer_id
LIMIT 100;
```

**Pitfall:** N+1 problems are invisible without query count monitoring. Always log query counts per request in development.

---

### Q25. How do you optimize a query that uses multiple JOINs?

**Summary:** Ensure each join column is indexed, minimize rows entering each join, and verify the optimizer is choosing the right join order and strategy.

**Techniques:**
1. **Index every FK column** — join predicates are the primary reason FK columns should be indexed.
2. **Filter early** — apply WHERE filters on the most selective table first; the optimizer usually handles this but check with EXPLAIN.
3. **Avoid functions on join columns** — `ON COALESCE(a.id, 0) = b.id` cannot use indexes.
4. **Check estimated vs. actual row counts** at each join node via `EXPLAIN ANALYZE`.
5. **Check join type** — a Hash Join is efficient for large sets; a Nested Loop needs the inner set to be small and indexed.
6. **Materialized CTEs** — in PostgreSQL ≥ 12, use `WITH t AS MATERIALIZED` when a CTE is referenced multiple times.

**Example — ensure FK indexes exist:**
```sql
CREATE INDEX idx_orders_customer     ON orders(customer_id);
CREATE INDEX idx_order_items_order   ON order_items(order_id);
CREATE INDEX idx_order_items_product ON order_items(product_id);
```

**Pitfall:** Joining on mismatched data types (e.g., `INT` FK to `BIGINT` PK) causes implicit casts that disable index use. Keep FK and PK types identical.

---

## Group 6 — Read/Write Patterns

---

### Q26. What are read/write patterns and why do they drive schema design?

**Summary:** Read/write patterns describe *how often* and *in what shape* an application reads and writes data. They are the primary input to schema design decisions.

**Key questions to ask:**
- What is the read:write ratio?
- What are the most frequent query shapes (SELECT patterns)?
- Are writes bursty or steady?
- Do reads need to be real-time or can they tolerate slight staleness?
- Is data accessed row-by-row or in bulk analytical scans?

**Impact on design:**
| Pattern | Design implication |
|---------|-------------------|
| Read-heavy, simple lookups | Denormalize, add covering indexes |
| Write-heavy, append-only | Wide PK on timestamp, minimal indexes, partitioning |
| Complex analytical reads | Star/snowflake schema, columnar storage |
| Mixed OLTP | 3NF normalized, indexed FKs, connection pooling |

**Interview takeaway:** Never design a schema in isolation — always ask about read/write ratio and query patterns before picking a structure.

---

### Q27. What is CQRS and how does it relate to database design?

**Summary:** **Command Query Responsibility Segregation (CQRS)** separates the write model (commands that mutate state) from the read model (queries that fetch data), allowing each to be optimized independently.

**Details:**
- The **write side** uses a normalized schema optimized for transactional integrity.
- The **read side** uses a denormalized, query-optimized projection (often a separate database or materialized view).
- Changes propagate from write to read side via events or change data capture (CDC).

**Example architecture:**
```
Write side (PostgreSQL, normalized):
  orders, order_items, customers, products

Read side (materialized view or Redis / Elasticsearch):
  order_summary { order_id, customer_name, total, status, item_count }
  — rebuilt asynchronously on order events
```

**Pitfall:** CQRS adds eventual consistency and operational complexity. Adopt it only when the read/write impedance mismatch is severe and measurable.

---

### Q28. How do you design a schema for a write-heavy workload?

**Summary:** Minimize write amplification: reduce index count, use append-only patterns, partition to spread I/O, and batch writes.

**Techniques:**
- **Fewer indexes** — each insert/update must maintain every index.
- **Append-only tables** — never UPDATE; insert new versions and archive old rows.
- **Partitioning by time** — new writes always hit the current partition; old partitions become read-only.
- **Batching** — accumulate writes and flush in bulk (COPY, bulk INSERT).
- **UUID v7 / ULID PKs** — monotonically increasing, so inserts are always at the end of the clustered index, avoiding page splits from random UUIDs.
- **WAL tuning** — increase `wal_buffers`, tune `checkpoint_completion_target`.

**Pitfall:** Using random UUIDs as a clustered PK on a write-heavy table causes severe **index fragmentation** and random I/O. Use sequential IDs or time-ordered UUIDs.

---

### Q29. How do you design a schema for a read-heavy workload?

**Summary:** Optimize for read speed: denormalize hot paths, add covering indexes, use materialized views, cache aggressively, and separate reads from writes using replicas.

**Techniques:**
- **Denormalize hot join paths** — pre-join frequently queried columns.
- **Covering indexes** — let the most common queries use index-only scans.
- **Materialized views** — pre-compute expensive aggregations.
- **Read replicas** — route SELECT traffic to replicas; leave writes to primary.
- **Caching layer (Redis)** — cache query results with appropriate TTLs.
- **Connection pooling (PgBouncer)** — many short-lived reads exhaust connections; pool them.

**Example — materialized view:**
```sql
CREATE MATERIALIZED VIEW mv_monthly_sales AS
SELECT
  date_trunc('month', order_date) AS month,
  SUM(total)                      AS revenue,
  COUNT(*)                        AS order_count
FROM orders
GROUP BY 1;

CREATE UNIQUE INDEX ON mv_monthly_sales(month);

-- Refresh periodically without locking:
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_monthly_sales;
```

**Pitfall:** Stale materialized views mislead dashboards. Use `CONCURRENTLY` refresh to avoid locking and schedule it appropriately.

---

### Q30. What is eventual consistency and when is it acceptable?

**Summary:** **Eventual consistency** means that given no new writes, all replicas will *eventually* converge to the same value — but reads may return stale data in the short term.

**Details:**
- Contrasts with **strong consistency** — all reads see the latest write immediately.
- In distributed systems, the CAP theorem forces a choice between consistency and availability during network partitions — eventual consistency trades consistency for availability and performance.

**When acceptable:** Social media feeds, product recommendations, caches, search indexes, activity counters.
**When NOT acceptable:** Bank balances, inventory deductions, authentication tokens, booking systems.

**Patterns to manage it:**
- Read-your-own-writes: route a user's reads to the same replica that received their write.
- Versioning/CAS (Compare-and-Swap): detect and reject stale updates.
- CRDTs for counters and sets in distributed contexts.

**Interview takeaway:** Categorize data by consistency requirements first. Not everything needs strong consistency, and demanding it everywhere is expensive.

---

## Group 7 — Sharding & Partitioning

---

### Q31. What is horizontal partitioning (sharding) and why is it used?

**Summary:** **Sharding** splits table data across multiple independent database servers (shards), each owning a subset of rows, to scale beyond what a single server can handle.

**Details:**
- Each shard is a full, independent database with its own CPU, RAM, and disk.
- The application (or a routing layer) determines which shard holds a given row using a **shard key**.
- Enables near-linear horizontal scaling of storage and throughput.
- Used when a single server has hit its vertical scaling ceiling.

**Pitfall:** Cross-shard queries (JOINs, aggregations spanning all shards) are expensive and complex. Choose a shard key that co-locates data accessed together (e.g., `tenant_id`, `user_id`).

---

### Q32. What are the main sharding strategies?

**Summary:** The three primary strategies are **range**, **hash**, and **directory (lookup)** sharding.

| Strategy | How it works | Pros | Cons |
|----------|-------------|------|------|
| **Range** | Rows with key in range [A–M] → shard 1, [N–Z] → shard 2 | Easy range scans; easy rebalancing by splitting ranges | Hot spots if data is skewed |
| **Hash** | `shard = hash(shard_key) % N` | Even distribution; no hot spots | Range queries hit all shards; resharding requires rehashing |
| **Directory** | Lookup table maps each key to a shard | Flexible; supports custom placement | Lookup table is a bottleneck/SPOF if not cached |

**Interview takeaway:** Hash sharding is most common for user data. Range sharding is common for time-series data. Directory sharding is used in multi-tenant SaaS for custom placement per tenant.

---

### Q33. What is vertical partitioning?

**Summary:** **Vertical partitioning** splits a table's **columns** across multiple tables or databases, rather than splitting rows.

**Details:**
- Used when a table has many columns but different queries access very different subsets.
- A `users` table might be split into `users_auth(user_id, email, password_hash)` and `users_profile(user_id, bio, avatar_url, preferences)`.
- The join cost to reunite them is the accepted trade-off for smaller, faster row reads.
- Column-oriented databases (BigQuery, Redshift, ClickHouse) take this to the extreme — each column is stored separately.

**Example:**
```sql
-- Hot path: authentication (accessed every request)
CREATE TABLE users_auth (
  user_id       UUID PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  last_login    TIMESTAMPTZ
);

-- Cold path: profile display (accessed rarely)
CREATE TABLE users_profile (
  user_id    UUID PRIMARY KEY REFERENCES users_auth(user_id),
  bio        TEXT,
  avatar_url TEXT,
  website    TEXT
);
```

**Pitfall:** Vertical partitioning across separate services makes atomic updates across both halves impossible without distributed transactions.

---

### Q34. What is table partitioning (range, list, hash)?

**Summary:** **Table partitioning** physically splits a single logical table into child partitions stored separately, managed transparently by the database engine.

| Type | Use case | Example |
|------|----------|---------|
| **Range** | Time-series, sequential data | Partition `orders` by `order_date` — one partition per month |
| **List** | Categorical column with known values | Partition `events` by `region` — one partition per country |
| **Hash** | Even distribution with no natural range | Partition `user_events` by `hash(user_id)` |

**Example SQL (PostgreSQL declarative partitioning):**
```sql
CREATE TABLE events (
  event_id    BIGSERIAL,
  occurred_at TIMESTAMPTZ NOT NULL,
  payload     JSONB
) PARTITION BY RANGE (occurred_at);

CREATE TABLE events_2024_q1
  PARTITION OF events
  FOR VALUES FROM ('2024-01-01') TO ('2024-04-01');

CREATE TABLE events_2024_q2
  PARTITION OF events
  FOR VALUES FROM ('2024-04-01') TO ('2024-07-01');
```

**Pitfall:** Queries that don't include the partition key in the WHERE clause will scan all partitions — ensure the partition key is always in hot query predicates (partition pruning).

---

### Q35. What are the operational challenges of sharding?

**Summary:** Sharding solves scale but introduces significant complexity in query routing, data rebalancing, cross-shard operations, and schema changes.

**Challenges:**

| Challenge | Description |
|-----------|-------------|
| **Cross-shard queries** | JOINs and aggregations must be scatter-gathered and merged |
| **Resharding** | Adding/removing shards requires migrating data; hash sharding needs full rehash |
| **Distributed transactions** | Two-phase commit (2PC) is slow and error-prone |
| **Schema migrations** | Must be applied to every shard with careful rolling migrations |
| **Hotspot shards** | Poor shard key choice leads to imbalanced load |
| **Global sequences** | Auto-increment PKs don't work across shards — use UUIDs or Snowflake IDs |

**Interview takeaway:** Sharding is a last resort after exhausting vertical scaling, read replicas, caching, and partitioning. Most applications never need it. Validate the need with benchmarks before committing.

---

## Group 8 — Replication & High Availability

---

### Q36. What is database replication and what are its types?

**Summary:** **Replication** copies data from one database instance (primary) to one or more others (replicas/standbys) to improve availability, durability, and read scalability.

**Types:**
| Type | Description |
|------|-------------|
| **Primary-replica (leader-follower)** | Single primary handles all writes; replicas serve reads |
| **Multi-primary (multi-master)** | Multiple nodes accept writes; conflicts must be resolved |
| **Logical replication** | Replicates row-level changes (INSERT/UPDATE/DELETE); flexible routing |
| **Physical/streaming replication** | Replicates WAL byte-stream; replica is an exact binary copy |

**Interview takeaway:** Primary-replica is the standard setup for most OLTP systems. Multi-primary is used in active-active geo-distributed systems but requires a conflict resolution strategy.

---

### Q37. What is the difference between synchronous and asynchronous replication?

**Summary:**
- **Synchronous:** The primary waits for at least one replica to confirm it has written the data before acknowledging the commit. **Zero data loss** but higher write latency.
- **Asynchronous:** The primary acknowledges the commit immediately; the replica catches up independently. **Lower latency** but potential data loss on primary failure.

**Trade-offs:**

| Concern | Synchronous | Asynchronous |
|---------|-------------|--------------|
| Durability | High (zero data loss) | RPO > 0 (some data loss possible) |
| Write latency | Higher (network RTT to replica) | Lower |
| Replica lag | Near zero | Can lag seconds to minutes |
| Availability | Replica failure can block primary | Primary unaffected by replica issues |

**Example (PostgreSQL):**
```conf
# postgresql.conf on primary
synchronous_standby_names = 'replica1'   -- synchronous
# leave empty for asynchronous
```

**Pitfall:** In synchronous mode, if the designated replica becomes unavailable, writes on the primary stall. Use carefully with a confirmed automatic failover plan.

---

### Q38. What is a read replica and what workloads does it serve?

**Summary:** A **read replica** is a continuously updated copy of the primary database that accepts only SELECT queries, offloading read traffic from the primary.

**Best for:**
- Reporting and analytics queries that are long-running and resource-intensive.
- Read-heavy application traffic (dashboards, product listings, search).
- Staging environment reads that need realistic data.

**Not suitable for:**
- Reads that must see the very latest write (sessions, balances, inventory) — replica lag may return stale data.
- Any workload requiring write access.

**Implementation pattern:**
```python
def get_db_connection(read_only=False):
    if read_only:
        return connect(REPLICA_DSN)
    return connect(PRIMARY_DSN)
```

**Pitfall:** Read replicas introduce replication lag. If a user writes data and immediately reads from a replica, they may not see their own write. Route user-facing reads after writes to the primary.

---

### Q39. How do you achieve high availability (HA) for a database?

**Summary:** HA means the database remains accessible despite component failures. Achieve it through **redundancy + automatic failover + health monitoring**.

**Key components:**
| Component | Purpose |
|-----------|---------|
| **Synchronous standby** | Eliminates data loss on primary failure |
| **Automatic failover** | Promotes standby without manual intervention (Patroni, AWS RDS Multi-AZ) |
| **Health checks / VIP** | Route traffic to the current primary via floating IP or load balancer |
| **Connection pooler** | PgBouncer absorbs reconnects during failover |
| **Multiple AZs** | Protects against data-center-level failure |

**HA tiers:**
- **99.9% (8.7 hrs/year downtime):** Single primary + async replica + manual failover.
- **99.99% (52 min/year):** Synchronous standby + automatic failover (e.g., RDS Multi-AZ).
- **99.999% (5 min/year):** Active-active multi-region with conflict resolution.

**Pitfall:** HA without regular failover drills is false security. Test automatic failover monthly in production.

---

### Q40. What is the CAP theorem and how does it apply to database choices?

**Summary:** The **CAP theorem** states that a distributed system can guarantee at most two of three properties: **Consistency** (all nodes see the same data), **Availability** (every request gets a response), and **Partition Tolerance** (system works despite network partitions).

**In practice:** Network partitions are unavoidable, so you must choose between **CP** (consistent but may be unavailable during partition) or **AP** (available but may return stale data).

| System | Stance | Examples |
|--------|--------|---------|
| CP | Consistency over availability | HBase, ZooKeeper, traditional RDBMS clusters |
| AP | Availability over consistency | Cassandra (tunable), CouchDB, DynamoDB |
| CA | Not partition-tolerant (single node) | Single-server PostgreSQL/MySQL |

**Pitfall:** CAP is a theoretical model. Real systems offer **tunable consistency** (e.g., Cassandra's consistency levels). The PACELC theorem extends CAP by considering latency vs. consistency trade-offs during normal operation (no partition).

---

## Group 9 — Schema Evolution

---

### Q41. What is schema migration and how do you do it safely?

**Summary:** A **schema migration** is a versioned, repeatable change to the database structure (adding columns, altering types, creating tables). Safe migrations are **backwards compatible**, **idempotent**, and **run without locking production tables**.

**Best practices:**
1. Version every migration (sequential integers or timestamps).
2. Separate DDL from data backfill — run DDL (fast) then backfill (slow, batched) in separate deploys.
3. Use online DDL tools for large tables: `pt-online-schema-change` (MySQL), `pg_repack` or `NOT VALID` + `VALIDATE` (PostgreSQL).
4. Always have a rollback script alongside each migration.
5. Test migrations on a production-scale copy first.

**Tools:** Flyway, Liquibase, Alembic, Rails Active Record migrations, golang-migrate.

**Pitfall:** Running a migration that takes an `ACCESS EXCLUSIVE` lock on a large table during peak traffic causes an outage. Always set `lock_timeout` and `statement_timeout` guards.

---

### Q42. What is the expand-contract pattern for zero-downtime migrations?

**Summary:** The **expand-contract** pattern makes breaking schema changes in three non-breaking phases to avoid downtime.

**Three phases:**

| Phase | Action | App behavior |
|-------|--------|-------------|
| **Expand** | Add new column/table alongside old | Write to both old and new; read from old |
| **Migrate** | Backfill existing data from old → new | Both written; reads switch to new |
| **Contract** | Drop old column/table | Write and read only from new |

**Example — renaming a column `user_name` → `full_name`:**
```sql
-- Phase 1: Expand — add new column
ALTER TABLE users ADD COLUMN full_name TEXT;

-- Phase 2: Backfill + dual-write in application
UPDATE users SET full_name = user_name WHERE full_name IS NULL;

-- Phase 3: Contract — remove old column after all deploys use full_name
ALTER TABLE users DROP COLUMN user_name;
```

**Pitfall:** Skipping the backfill step before switching reads leads to NULL data in production. Always verify backfill is 100% complete before contracting.

---

### Q43. How do you rename a column without downtime?

**Summary:** Use the **expand-contract pattern** — add the new column, dual-write, backfill, switch reads, then drop the old column across multiple deployments.

**Step-by-step:**
```sql
-- Deploy 1: Add new column, backfill (batch for large tables)
ALTER TABLE users ADD COLUMN full_name TEXT;
UPDATE users SET full_name = username WHERE full_name IS NULL;
ALTER TABLE users ALTER COLUMN full_name SET NOT NULL;

-- Application Deploy 2: reads from full_name, still writes both columns
-- Application Deploy 3: writes only full_name, reads full_name

-- Deploy 4: Remove old column
ALTER TABLE users DROP COLUMN username;
```

**PostgreSQL ≥ 11 with a default value (safe for large tables):**
```sql
-- Stores default in catalog, does NOT rewrite the table
ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT '';
```

**Pitfall:** Renaming a column in a single migration (`ALTER TABLE ... RENAME COLUMN`) is instant but immediately breaks running application instances still referencing the old column name.

---

### Q44. What are the risks of adding NOT NULL columns to large tables?

**Summary:** Adding a `NOT NULL` column without a default requires scanning the entire table to verify no NULLs, and in older databases, a full table rewrite — both can cause prolonged locks and outages.

**PostgreSQL behavior by version:**
| Version | Behavior |
|---------|---------|
| < 11 | `ADD COLUMN NOT NULL DEFAULT val` rewrites entire table |
| ≥ 11 | `ADD COLUMN NOT NULL DEFAULT val` stores default in catalog; near-instant |
| Any | `ADD COLUMN NOT NULL` (no default) still requires a table scan |

**Safe approach (any version):**
```sql
-- Step 1: Add as nullable
ALTER TABLE users ADD COLUMN preferences JSONB;

-- Step 2: Backfill in batches (avoid one giant UPDATE)
UPDATE users SET preferences = '{}' WHERE id BETWEEN 1 AND 100000 AND preferences IS NULL;

-- Step 3: Add constraint as NOT VALID (skips existing rows, uses light lock)
ALTER TABLE users ADD CONSTRAINT pref_not_null
  CHECK (preferences IS NOT NULL) NOT VALID;

-- Step 4: Validate in background (ShareUpdateExclusiveLock — does not block reads/writes)
ALTER TABLE users VALIDATE CONSTRAINT pref_not_null;
```

**Pitfall:** `NOT VALID` skips new-row checking on existing rows during the initial DDL; the subsequent validate phase scans all rows but with a lighter lock that doesn't block reads or writes.

---

### Q45. How do you manage migration scripts in a team environment?

**Summary:** Use a migration framework with **versioned, numbered scripts** stored in version control alongside application code, applied automatically in CI/CD before deployment.

**Best practices:**
- **One migration per change** — atomic, focused changesets are easier to review and roll back.
- **Never edit an applied migration** — treat applied migrations as immutable history.
- **Store in VCS** — migrations live in `db/migrations/` alongside the application code they serve.
- **Apply in CI before deploying** — ensures schema matches the deployed code version.
- **Use checksums** — frameworks like Flyway validate that applied migration files haven't been modified.

**Naming convention:**
```
V001__create_users_table.sql
V002__add_email_index.sql
V003__add_users_preferences_column.sql
```

**Pitfall:** Two developers creating migrations concurrently with the same version number causes conflicts. Use timestamps (`20240615120000__add_column.sql`) to avoid numbering conflicts in parallel branches.

---

## Group 10 — Backups & Recovery

---

### Q46. What backup strategies exist for production databases?

**Summary:** The three primary backup types are **full**, **incremental**, and **continuous (WAL archiving / binlog streaming)**, often combined into a layered strategy.

| Strategy | Description | RPO | RTO |
|----------|-------------|-----|-----|
| **Full backup** | Complete copy of all data | Hours to days | Hours |
| **Incremental** | Only changes since last backup | Hours | Hours (restore base + increments) |
| **Differential** | Changes since last full | Hours | Faster than incremental restore |
| **Continuous WAL/binlog archiving** | Stream every transaction log | Seconds to minutes | Minutes (PITR) |

**Best practice — layered approach:**
```
Daily full backup → hourly incremental → continuous WAL archiving
Restore path: latest full + increments to desired point + WAL replay
```

**Pitfall:** Backups stored on the same server as the database are useless if the server is lost. Always store backups in separate storage (S3, GCS) in a different region.

---

### Q47. What is point-in-time recovery (PITR)?

**Summary:** **PITR** allows you to restore a database to any specific moment in time by replaying transaction logs (WAL, binlog) up to a target timestamp — not just to the last full backup.

**How it works:**
1. Restore the last full backup.
2. Apply archived WAL/binlog files sequentially.
3. Stop replay at the desired timestamp or LSN.

**Use cases:**
- Recovering from accidental `DROP TABLE` or `DELETE` without `WHERE`.
- Auditing database state at a specific past time.
- Regulatory compliance.

**PostgreSQL configuration:**
```conf
restore_command = 'aws s3 cp s3://my-wal-archive/%f %p'
recovery_target_time = '2024-06-15 14:30:00 UTC'
recovery_target_action = 'promote'
```

**Pitfall:** PITR requires continuous WAL archiving to be enabled *before* the incident. If WAL archiving was off, you can only restore to a full backup point.

---

### Q48. What is RTO and RPO and why do they matter for backup strategy?

**Summary:**
- **RPO (Recovery Point Objective):** Maximum acceptable data loss, measured in time. How old can the restored data be?
- **RTO (Recovery Time Objective):** Maximum acceptable downtime from incident to full recovery. How long can the system be unavailable?

**Relationship to backup design:**

| RPO / RTO requirement | Strategy |
|-----------------------|---------|
| RPO: days, RTO: days | Daily full backup, no PITR |
| RPO: hours, RTO: hours | Daily full + hourly incremental |
| RPO: minutes, RTO: hours | Continuous WAL archiving + PITR |
| RPO: seconds, RTO: minutes | Synchronous standby replica + automatic failover |
| RPO: 0, RTO: seconds | Synchronous multi-AZ with instant failover |

**Cost scales inversely with both RPO and RTO** — tighter requirements mean more infrastructure.

**Interview takeaway:** Always frame backup decisions around RPO and RTO numbers agreed with the business. "We back up daily" is meaningless without knowing whether daily data loss is acceptable.

---

### Q49. How do you test database backups?

**Summary:** A backup that has never been tested is not a backup — it's a hope. Test backups by **regularly performing full restores** in a non-production environment and verifying data integrity.

**Testing checklist:**
1. **Scheduled restore drills:** Restore the latest backup to a test environment weekly/monthly.
2. **Integrity check:** Run row count + checksum comparisons, `pg_dump | pg_restore` validation, or `DBCC CHECKDB` (SQL Server).
3. **Application smoke test:** Deploy the application against the restored backup and run a basic test suite.
4. **PITR test:** Perform a point-in-time restore to a specific timestamp and validate the state.
5. **Measure RTO:** Time the full restore process — ensure it meets the agreed RTO.
6. **Alert on backup failures:** Alert immediately when any scheduled backup job fails.

**Pitfall:** Only testing restores during an actual crisis is the most common and costly mistake in database operations. Automate restore testing in your CI/CD pipeline.

---

### Q50. What are common database operational metrics to monitor?

**Summary:** Monitoring should cover query performance, resource utilization, replication health, and backup status. Alerting thresholds should be defined before incidents occur.

**Core metrics:**

| Category | Metric | Alert when |
|----------|--------|-----------|
| **Performance** | Query latency (p99) | > SLA threshold |
| **Performance** | Slow query count | Count increases |
| **Resources** | CPU utilization | > 80% sustained |
| **Resources** | Disk I/O utilization | > 90% |
| **Resources** | Disk space free | < 20% |
| **Resources** | Connection count | > 80% of `max_connections` |
| **Replication** | Replica lag | > acceptable RPO |
| **Replication** | Replication slot bloat | WAL size growing unbounded |
| **Locks** | Long-running transactions | > 30 seconds |
| **Locks** | Lock wait count | Spike above baseline |
| **Backups** | Last successful backup age | > RPO |
| **Tables** | Table bloat (dead rows) | > 20% dead tuples |

**Tools:** `pg_stat_activity`, `pg_stat_replication`, `pg_stat_user_tables`, Datadog, Prometheus + postgres_exporter, CloudWatch RDS Enhanced Monitoring.

**Pitfall:** Replication slot bloat is a silent killer in PostgreSQL — a lagging replica causes the primary to retain WAL indefinitely, filling the disk and crashing the primary. Always set `max_slot_wal_keep_size`.

---

*End of question bank — 50 questions across 10 groups.*
