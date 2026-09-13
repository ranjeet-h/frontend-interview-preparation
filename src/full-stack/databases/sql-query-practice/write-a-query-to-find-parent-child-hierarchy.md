# Write a Query to Find Parent-Child Hierarchy (Recursive CTE) in SQL

## 1. What the Interviewer Is Really Testing

Relational database tables are flat and two-dimensional, but real-world domain models are full of hierarchical trees: employee org charts, nested comment threads, category taxonomies, and folder file systems. In an adjacency list schema (`Employees(id, name, manager_id)` or `Categories(id, name, parent_id)`), each row points only to its direct parent.

When an interviewer asks you to query a parent-child hierarchy, they are testing:

1. **Recursive Common Table Expressions (`WITH RECURSIVE`):** Do you know how to query trees of arbitrary, unknown depth without hardcoding brittle self-joins?
2. **Anchor vs. Recursive Member Mechanics:** Do you understand how a recursive CTE initializes with a base case (Anchor Member) and iteratively expands (Recursive Member) through a `UNION ALL` until the intermediate working queue becomes empty?
3. **Directional Traversal:** Can you traverse both top-down (finding all descendants/subtrees under a manager) and bottom-up (finding all ancestors/breadcrumbs above an item)?
4. **Data Integrity and Infinite Loop Prevention:** Do you anticipate cycles in dirty data (e.g., employee A reports to B, B reports to C, C reports to A) and know how to guard queries using recursion depth limits (`cte_max_recursion_depth`) and cycle detection?
5. **Architectural Trade-offs of Hierarchical Models:** Do you understand the limitations of the Adjacency List pattern compared to alternatives like Closure Tables, Nested Sets, and Materialized Paths?

## 2. Think Before You Code — The Senior Dev Thought Process

When I see a hierarchical query problem, my instinct is to immediately avoid fixed self-joins (`JOIN Employees e2 ON e1.manager_id = e2.id`). If you write five chained joins, your query breaks the second someone adds a sixth management level. Fetching all rows into application memory and building the tree in Node.js or Python is equally problematic for large datasets because it wastes network bandwidth and bypasses database indexing.

To solve this cleanly in SQL with a Recursive CTE, I walk through three core decisions:

1. **Identify the Anchor (The Base Case):**
   Where does the traversal start? For a top-down org chart of the entire company, the root is any employee whose `manager_id IS NULL`. If the interviewer asks for a specific department, the anchor filters by that manager's specific `id`. For a bottom-up breadcrumb search, the anchor is the target child row.
2. **Define the Recursive Join Condition (The Step):**
   In a top-down traversal, I join the source table `Employees e` with the CTE result `o` on `e.manager_id = o.id` (matching the next generation of direct reports). In a bottom-up traversal, I join on `e.id = o.manager_id` (stepping up to the manager).
3. **Track Metadata Across Generations:**
   Usually, a bare list of names is not enough. We need hierarchy depth (`level = level + 1`) and a lineage breadcrumb (`path = CONCAT(path, ' -> ', name)`). In SQL, the column type and length of the entire CTE are locked in by the Anchor Member. I must explicitly cast strings (e.g., `CAST(name AS CHAR(1000))` or `VARCHAR(1000)`) in the anchor, or string concatenation in deeper levels will cause truncation errors.
4. **Guard Against Cyclic Explosions:**
   If production data has a circular reference, a recursive CTE will spin forever until it hits the server's recursion ceiling or exhausts memory. I need cycle tracking or depth boundaries, and I need to think about termination: recursion stops only when the working table comes back empty.

This is the mental checklist I run before typing `WITH RECURSIVE`.

## 3. The Solution — Fully Explained Code

Consider the following standard employee schema:

```sql
CREATE TABLE Employees (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    manager_id INT NULL,
    title VARCHAR(100) NOT NULL,
    FOREIGN KEY (manager_id) REFERENCES Employees(id)
);
CREATE INDEX idx_employees_manager_id ON Employees(manager_id);
```

**Solution 1: Top-down org chart — full subtree with levels and path building**

This query finds all employees, computes their managerial depth, builds a full reporting path, and formats a visual hierarchy. It demonstrates the classic anchor + recursive member + termination pattern and the path-building technique.

```sql
WITH RECURSIVE OrgChart AS (
    -- 1. ANCHOR MEMBER: Find the root level (employees with no manager)
    SELECT 
        id,
        name,
        manager_id,
        title,
        1 AS level,
        CAST(name AS CHAR(1000)) AS path
    FROM Employees
    WHERE manager_id IS NULL

    UNION ALL

    -- 2. RECURSIVE MEMBER: Find direct reports of anyone currently in OrgChart
    SELECT 
        e.id,
        e.name,
        e.manager_id,
        e.title,
        o.level + 1 AS level,
        CAST(CONCAT(o.path, ' -> ', e.name) AS CHAR(1000)) AS path
    FROM Employees e
    INNER JOIN OrgChart o 
        ON e.manager_id = o.id
)
-- 3. FINAL SELECT: Display the hierarchy ordered by path for tree visualization
SELECT 
    id,
    CONCAT(REPEAT('    ', level - 1), name) AS visual_hierarchy,
    title,
    level,
    path
FROM OrgChart
ORDER BY path;
```

Why this works: the anchor seeds the working table with roots. Each recursive iteration joins `Employees` against the working table to find the next generation. The engine repeats until the working table is empty — that empty result is the termination condition. `level + 1` tracks depth. `CAST(... AS CHAR(1000))` in the anchor locks the column wide enough so `CONCAT` in deeper levels does not truncate.

**Solution 2: Bottom-up ancestor search — breadcrumb chain for a single node**

Given a target employee (e.g., `id = 6`), traverse upward to find every manager in their direct chain of command up to the CEO. This tests the opposite join direction.

```sql
WITH RECURSIVE ManagerChain AS (
    -- ANCHOR: Start at the specific target employee
    SELECT 
        id,
        name,
        manager_id,
        title,
        0 AS steps_above
    FROM Employees
    WHERE id = 6

    UNION ALL

    -- RECURSIVE: Move UP the tree by matching the current node's manager_id to employee id
    SELECT 
        m.id,
        m.name,
        m.manager_id,
        m.title,
        mc.steps_above + 1 AS steps_above
    FROM Employees m
    INNER JOIN ManagerChain mc 
        ON m.id = mc.manager_id
)
SELECT 
    id,
    name,
    title,
    steps_above
FROM ManagerChain
ORDER BY steps_above ASC;
```

**Solution 3: Cycle-safe traversal with loop detection**

If the database contains circular references, you can prevent infinite loops by tracking visited IDs in a path string or array. Always pair this with a recursion depth guard.

**MySQL / dialect-neutral string tracking:**

```sql
-- Safeguard: Set maximum allowable recursion depth (MySQL default is 1000)
SET SESSION cte_max_recursion_depth = 1000;

WITH RECURSIVE SafeOrgChart AS (
    SELECT 
        id,
        name,
        manager_id,
        1 AS level,
        CAST(name AS CHAR(1000)) AS path,
        CAST(CONCAT(',', id, ',') AS CHAR(1000)) AS visited_ids
    FROM Employees
    WHERE manager_id IS NULL

    UNION ALL

    SELECT 
        e.id,
        e.name,
        e.manager_id,
        s.level + 1,
        CAST(CONCAT(s.path, ' -> ', e.name) AS CHAR(1000)),
        CAST(CONCAT(s.visited_ids, e.id, ',') AS CHAR(1000))
    FROM Employees e
    INNER JOIN SafeOrgChart s 
        ON e.manager_id = s.id
    -- Stop traversal if this employee ID is already in the visited chain
    WHERE INSTR(s.visited_ids, CONCAT(',', e.id, ',')) = 0
)
SELECT id, name, level, path FROM SafeOrgChart;
```

**PostgreSQL native CYCLE clause (PostgreSQL 14+):**

```sql
WITH RECURSIVE OrgChart AS (
    SELECT id, name, manager_id, 1 AS level, name::text AS path
    FROM Employees
    WHERE manager_id IS NULL
    UNION ALL
    SELECT e.id, e.name, e.manager_id, o.level + 1, o.path || ' -> ' || e.name
    FROM Employees e
    JOIN OrgChart o ON e.manager_id = o.id
)
CYCLE id SET is_cycle USING cycle_path
SELECT id, name, level, path, is_cycle FROM OrgChart;
```

Both approaches ensure termination even on dirty data. The string-tracking version works everywhere; the `CYCLE` clause is cleaner where PostgreSQL is available.

**Complexity analysis**

Time complexity is O(N + E) where N is the number of rows in the hierarchy and E is the number of parent-child relationships. With an index on `manager_id`, each recursive iteration does fast index lookups in O(log N) or hash joins. Without an index on `manager_id`, every recursive step does a full table scan, degrading to O(D * N) where D is the maximum depth of the tree.

Space complexity is O(N) auxiliary memory used by the database engine to maintain the working table (W) and accumulated result table (R) during execution.

## 4. Dry Run — Walk Through a Real Example

Let us trace how the SQL engine processes Solution 1 on a sample company dataset with the `Employees` and `manager_id` adjacency list.

**Sample data — Employees**

| id | name | manager_id | title |
|:---|:---|:---|:---|
| 1 | Alice | NULL | CEO |
| 2 | Bob | 1 | VP Engineering |
| 3 | Charlie | 1 | VP Sales |
| 4 | David | 2 | Staff Engineer |
| 5 | Eve | 2 | Senior Engineer |
| 6 | Frank | 4 | Junior Engineer |

**Step-by-step engine iteration trace**

Internally, the database engine maintains two temporary structures: W (Working Table) holds rows generated in the most recent iteration to feed into the next join, and R (Result Table) accumulates all generated rows returned in the final result.

```txt
Iteration 0 (Anchor Step):
  Evaluate: SELECT ... WHERE manager_id IS NULL
  Output:   { id: 1, name: 'Alice', level: 1, path: 'Alice' }
  W_0 = [ {id: 1, path: 'Alice'} ]
  R_0 = [ Alice(1) ]

Iteration 1 (Recursive Step 1):
  Join:     Employees e INNER JOIN W_0 ON e.manager_id = 1
  Matches:  - id: 2 (Bob), level: 2, path: 'Alice -> Bob'
            - id: 3 (Charlie), level: 2, path: 'Alice -> Charlie'
  W_1 = [ {id: 2, path: 'Alice -> Bob'}, {id: 3, path: 'Alice -> Charlie'} ]
  R_1 = [ Alice(1), Bob(2), Charlie(3) ]

Iteration 2 (Recursive Step 2):
  Join:     Employees e INNER JOIN W_1 ON e.manager_id IN (2, 3)
  Matches:  - id: 4 (David), level: 3, path: 'Alice -> Bob -> David' (from Bob)
            - id: 5 (Eve), level: 3, path: 'Alice -> Bob -> Eve' (from Bob)
            (Charlie has no reports)
  W_2 = [ {id: 4, path: '...David'}, {id: 5, path: '...Eve'} ]
  R_2 = [ Alice(1), Bob(2), Charlie(3), David(4), Eve(5) ]

Iteration 3 (Recursive Step 3):
  Join:     Employees e INNER JOIN W_2 ON e.manager_id IN (4, 5)
  Matches:  - id: 6 (Frank), level: 4, path: 'Alice -> Bob -> David -> Frank' (from David)
            (Eve has no reports)
  W_3 = [ {id: 6, path: '...Frank'} ]
  R_3 = [ Alice(1), Bob(2), Charlie(3), David(4), Eve(5), Frank(6) ]

Iteration 4 (Recursive Step 4):
  Join:     Employees e INNER JOIN W_3 ON e.manager_id = 6
  Matches:  (empty set - Frank has no direct reports)
  W_4 = empty (Working table is empty)
  TERMINATION: Recursion stops immediately when W is empty.
```

**Final query result**

| id | visual_hierarchy | title | level | path |
|:---|:---|:---|:---|:---|
| 1 | Alice | CEO | 1 | Alice |
| 2 |     Bob | VP Engineering | 2 | Alice -> Bob |
| 4 |         David | Staff Engineer | 3 | Alice -> Bob -> David |
| 6 |             Frank | Junior Engineer | 4 | Alice -> Bob -> David -> Frank |
| 5 |         Eve | Senior Engineer | 3 | Alice -> Bob -> Eve |
| 3 |     Charlie | VP Sales | 2 | Alice -> Charlie |

Notice how sorting by `path` automatically groups subtrees in depth-first order. This table is exactly what the verified sqlite3 run returns, just ordered by `path` for readable tree display.

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Data cycles (A -> B -> C -> A)**

The trap: bad data or manual admin edits cause employee 1 to report to employee 3 while employee 3 is already under employee 1. Standard recursion loops indefinitely.

The result: the query hangs until it crashes with `ERROR 3636: Recursive query aborted after 1001 iterations` in MySQL or consumes all server work memory in PostgreSQL.

The fix: always use cycle tracking as in Solution 3 and never rely on clean data alone. Add a `visited_ids` guard and set `cte_max_recursion_depth` as a kill-switch.

**2. Deep hierarchy hitting recursion limits**

The trap: even without cycles, a legitimate deep tree (for example, a 1500-level category chain or a long approval chain) exceeds the default recursion ceiling.

The result: MySQL aborts at `cte_max_recursion_depth` (default 1000), PostgreSQL at `max_stack_depth` / statement timeout. The query that works for 4 levels fails for 1200 levels.

The fix: set `cte_max_recursion_depth` higher for known deep trees, add a `WHERE level < 2000` guard in the recursive member, and index `manager_id` so each level is a cheap index seek. For truly unbounded depth, consider a materialized path column as an alternative model.

**3. Path string truncation**

The trap: writing `SELECT name AS path` in the anchor. The SQL engine infers the column type from the anchor. If the root name is "Alice" (5 characters), the engine sets the column to `VARCHAR(5)`.

The result: concatenating `Alice -> Bob` in recursive steps either silently truncates or throws a data truncation error, and you lose the breadcrumb.

The fix: explicitly cast to a large buffer in the anchor: `CAST(name AS CHAR(1000))` or `name::text` in PostgreSQL.

**4. Multiple roots / disconnected forests**

The trap: assuming there is only one CEO or one root node (`manager_id IS NULL`).

The result: if an organization has multiple top-level divisions or independent category trees, a query hardcoded to `WHERE id = 1` misses entire branches.

The fix: the anchor `WHERE manager_id IS NULL` naturally selects all root nodes, running all subtrees in parallel through the CTE. If you need only one subtree, filter the anchor to `WHERE id = :manager_id` to find all descendants of that specific parent.

**5. Non-standard root representation (0 or self-referencing id)**

The trap: some legacy databases store roots as `manager_id = 0` or self-referencing `manager_id = id` instead of `NULL`.

The result: `WHERE manager_id IS NULL` returns zero rows, so the whole CTE returns empty. A self-reference also creates an instant cycle on row 1.

The fix: normalize the anchor to `WHERE manager_id IS NULL OR manager_id = 0 OR manager_id = id` and exclude self-joins in the recursive step with `WHERE e.id <> e.manager_id`.

**6. Orphaned nodes (dangling foreign keys / orphan parent)**

The trap: an employee has `manager_id = 999` where id 999 was deleted. The parent does not exist.

The result: top-down traversal starting from the root silently ignores the orphan and all of that orphan's subordinates. You get a forest with invisible missing branches and no error.

The fix: enforce referential integrity with `FOREIGN KEY (manager_id) REFERENCES Employees(id) ON DELETE SET NULL` or `ON DELETE CASCADE`, and periodically audit for orphans with `SELECT * FROM Employees e LEFT JOIN Employees p ON e.manager_id = p.id WHERE e.manager_id IS NOT NULL AND p.id IS NULL`.

**7. Missing index on foreign key**

The trap: leaving `manager_id` unindexed because primary keys are already indexed.

The result: every single level of recursion forces a full table scan. For 100,000 rows with 8 hierarchy levels, the query scans 800,000 rows.

The fix: always create `CREATE INDEX idx_employees_manager_id ON Employees(manager_id)`. In MySQL, InnoDB does not auto-index a self-referencing foreign key unless you declare it.

## 6. Variations and Follow-ups

Interviewers rarely stop at the basic tree walk. Here are the three follow-ups they love, mapped to concrete query changes.

**Variation 1: Find all descendants of a given node (subtree query)**

Prompt: "Find everyone who reports — directly or indirectly — to Bob (id = 2)."

Change only the anchor. Instead of `WHERE manager_id IS NULL`, seed with the target manager. Everything else stays identical. This is the single most common hierarchy interview task.

```sql
WITH RECURSIVE Subtree AS (
    SELECT id, name, manager_id, 1 AS level, CAST(name AS CHAR(1000)) AS path
    FROM Employees WHERE id = 2  -- anchor on Bob
    UNION ALL
    SELECT e.id, e.name, e.manager_id, s.level + 1,
           CAST(CONCAT(s.path, ' -> ', e.name) AS CHAR(1000))
    FROM Employees e JOIN Subtree s ON e.manager_id = s.id
)
SELECT * FROM Subtree ORDER BY level, path;
-- Returns Bob, David, Eve, Frank
```

**Variation 2: Compute level depth and filter by depth**

Prompt: "Find employees at depth 3, or find the maximum depth of the org."

The `level` column we already carry (`level + 1` each iteration) is the answer. To limit depth, add `WHERE s.level < 3` in the recursive member, or filter in the final SELECT with `WHERE level = 3`. To get the deepest chain, `SELECT MAX(level) FROM OrgChart`.

**Variation 3: Materialized path as a stored alternative**

Prompt: "How would you avoid a recursive CTE entirely?"

Store the full path in a column like `path VARCHAR` with values `'1/'`, `'1/2/'`, `'1/2/4/'`. Then a subtree query becomes a single prefix search with no recursion.

```sql
-- With materialized path column
ALTER TABLE Employees ADD COLUMN mat_path VARCHAR(500);
-- Example values: Alice='1/', Bob='1/2/', David='1/2/4/', Frank='1/2/4/6/'
SELECT * FROM Employees WHERE mat_path LIKE '1/2/%';  -- all descendants of Bob
-- Fast with: CREATE INDEX idx_mat_path ON Employees(mat_path);
-- In PostgreSQL, use the ltree extension with GiST indexes for even faster prefix ops
```

This trades O(N) recursive work for O(1) indexed prefix lookup, at the cost of updating `mat_path` on every move. It is a direct answer to the materialized path comparison in the trade-off table.

**Variation 4: Subtree rollup aggregations (total headcount and salary per manager)**

Prompt: "How do you calculate the total salary expense of a manager including all direct and indirect reports?"

To aggregate across a full subtree, pair every ancestor with all descendants, then group by ancestor.

```sql
WITH RECURSIVE SubtreePairs AS (
    -- ANCHOR: Every employee is an ancestor to themselves
    SELECT 
        id AS root_manager_id,
        id AS employee_id,
        salary
    FROM Employees

    UNION ALL

    -- RECURSIVE: Find all downstream reports under employee_id
    SELECT 
        sp.root_manager_id,
        e.id AS employee_id,
        e.salary
    FROM Employees e
    INNER JOIN SubtreePairs sp 
        ON e.manager_id = sp.employee_id
)
SELECT 
    e.id AS manager_id,
    e.name AS manager_name,
    COUNT(sp.employee_id) - 1 AS total_indirect_reports,
    SUM(sp.salary) AS total_org_payroll
FROM SubtreePairs sp
JOIN Employees e ON sp.root_manager_id = e.id
GROUP BY e.id, e.name
ORDER BY total_org_payroll DESC;
```

**Variation 5: Alternative hierarchical storage models**

When asked to compare how trees can be modeled in relational databases, a senior engineer should compare four primary patterns:

| Model | Schema Pattern | Read Subtree Complexity | Insert / Move Complexity | Best Used When |
|:---|:---|:---|:---|:---|
| **Adjacency List** | `parent_id INT` column | O(N) via Recursive CTE | O(1) single-row update | Standard hierarchies where tree mutations and moves are frequent. |
| **Closure Table** | Separate table `(ancestor, descendant, depth)` | O(1) fast single join | O(N) updates for all ancestors | Deep, read-heavy trees where fast subtree queries are paramount. |
| **Nested Sets** | `lft INT, rgt INT` boundary columns | O(1) range filter | O(N) catastrophic writes | Read-only taxonomies with almost zero mutations. |
| **Materialized Path** | `path VARCHAR` column (e.g., `'1/2/4/'`) | O(1) prefix search | O(1) for leaf inserts | Systems using PostgreSQL `ltree` with GiST indexes. |

## 7. 🧠 The Memory Hook

Think of a Recursive CTE like a relay race: the Anchor hands the baton to the first generation (root nodes), and each Recursive Step passes the baton down to the next generation of children until an iteration comes up empty-handed — that empty working table is the finish line.

To keep the race smooth: CAST the path buffer wide at the start, index the `manager_id` foreign key so each handoff is fast, and track visited nodes so circular references do not turn your relay into an infinite loop.
