# Write a Query to Find Parent-Child Hierarchy (Recursive CTE) in SQL

## 1. What the Interviewer Is Really Testing

Relational database tables are flat and two-dimensional, but real-world domain models are full of hierarchical trees: employee org charts, nested comment threads, category taxonomies, and folder file systems. In an adjacency list schema (`Employees(id, name, manager_id)` or `Categories(id, name, parent_id)`), each row points only to its direct parent.

When an interviewer asks you to query a parent-child hierarchy, they are testing:

1. **Recursive Common Table Expressions (`WITH RECURSIVE`):** Do you know how to query trees of arbitrary, unknown depth without hardcoding brittle self-joins?
2. **Anchor vs. Recursive Member Mechanics:** Do you understand how a recursive CTE initializes with a base case (Anchor Member) and iteratively expands (Recursive Member) through a `UNION ALL` until the intermediate working queue becomes empty?
3. **Directional Traversal:** Can you traverse both top-down (finding all descendants/subtrees under a manager) and bottom-up (finding all ancestors/breadcrumbs above an item)?
4. **Data Integrity & Infinite Loop Prevention:** Do you anticipate cycles in dirty data (e.g., employee A reports to B, B reports to C, C reports to A) and know how to guard queries using recursion depth limits (`cte_max_recursion_depth`) and cycle detection?
5. **Architectural Trade-offs of Hierarchical Models:** Do you understand the limitations of the Adjacency List pattern compared to alternatives like Closure Tables, Nested Sets, and Materialized Paths?

## 2. Think Before You Code — The Senior Dev Thought Process

When I see a hierarchical query problem, my instinct is to immediately avoid fixed self-joins (`JOIN Employees e2 ON e1.manager_id = e2.id`). If you write five chained joins, your query breaks the second someone adds a sixth management level. Fetching all rows into application memory and building the tree in Node.js or Python is equally problematic for large datasets because it wastes network bandwidth and bypasses database indexing.

To solve this cleanly in SQL with a Recursive CTE, I walk through three core decisions:

1. **Identify the Anchor (The Base Case):**
   Where does the traversal start? For a top-down org chart of the entire company, the root is any employee whose `manager_id IS NULL`. If the interviewer asks for a specific department, the anchor filters by that manager's specific `id`. For a bottom-up breadcrumb search, the anchor is the target child row.
2. **Define the Recursive Join Condition (The Step):**
   In a top-down traversal, I join the source table `Employees e` with the CTE result `o` on `e.manager_id = o.id` (matching the next generation of direct reports). In a bottom-up traversal, I join on `e.id = o.manager_id` (stepping up to the manager).
3. **Track Metadata Across Generations:**
   Usually, a bare list of names isn't enough. We need hierarchy depth (`level = level + 1`) and a lineage breadcrumb (`path = CONCAT(path, ' -> ', name)`). In SQL, the column type and length of the entire CTE are locked in by the Anchor Member. I must explicitly cast strings (e.g., `CAST(name AS CHAR(1000))` or `VARCHAR(1000)`) in the anchor, or string concatenation in deeper levels will cause truncation errors.
4. **Guard Against Cyclic Explosions:**
   If production data has a circular reference, a recursive CTE will spin forever until it hits the server's recursion ceiling or exhausts memory. I need cycle tracking or depth boundaries.

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
```

### Solution 1: Top-Down Org Chart (Full Subtree with Levels and Paths)

This query finds all employees, computes their managerial depth, builds a full reporting path, and formats a visual hierarchy.

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

### Solution 2: Bottom-Up Ancestor Search (Breadcrumb Chain for a Single Node)

Given a target employee (e.g., `id = 6`), traverse upward to find every manager in their direct chain of command up to the CEO.

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

### Solution 3: Cycle-Safe Traversal with Loop Detection

If the database contains circular references, you can prevent infinite loops by tracking visited IDs in a path string or array.

#### MySQL / Dialect-Neutral String Tracking:
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

#### PostgreSQL Native `CYCLE` Clause (PostgreSQL 14+):
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

### Complexity Analysis

- **Time Complexity:** $O(N + E)$ where $N$ is the number of rows in the hierarchy and $E$ is the number of parent-child relationships. With an index on `manager_id`, each recursive iteration performs fast index lookups in $O(\log N)$ or hash joins. Without an index on `manager_id`, every recursive step performs a full table scan, degrading overall time to $O(D \cdot N)$ where $D$ is the maximum depth of the tree.
- **Space Complexity:** $O(N)$ auxiliary memory used by the database engine to maintain the working table ($W$) and accumulated result table ($R$) during execution.

## 4. Dry Run — Walk Through a Real Example

Let's trace how the SQL engine processes **Solution 1** on a sample company dataset:

### Sample Data (`Employees`)

| id | name | manager_id | title |
|:---|:---|:---|:---|
| 1 | Alice | NULL | CEO |
| 2 | Bob | 1 | VP Engineering |
| 3 | Charlie | 1 | VP Sales |
| 4 | David | 2 | Staff Engineer |
| 5 | Eve | 2 | Senior Engineer |
| 6 | Frank | 4 | Junior Engineer |

### Step-by-Step Engine Iteration Trace

Internally, the database engine maintains two temporary structures:
- **$W$ (Working Table):** Holds rows generated in the *most recent iteration* to feed into the next join.
- **$R$ (Result Table):** Accumulates all generated rows returned in the final result.

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
  Matches:  Ø (Empty set - Frank has no direct reports)
  W_4 = Ø (Working table is empty)
  TERMINATION: Recursion stops immediately.
```

### Final Query Result Output

| id | visual_hierarchy | title | level | path |
|:---|:---|:---|:---|:---|
| 1 | Alice | CEO | 1 | Alice |
| 2 | &nbsp;&nbsp;&nbsp;&nbsp;Bob | VP Engineering | 2 | Alice -> Bob |
| 4 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;David | Staff Engineer | 3 | Alice -> Bob -> David |
| 6 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Frank | Junior Engineer | 4 | Alice -> Bob -> David -> Frank |
| 5 | &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Eve | Senior Engineer | 3 | Alice -> Bob -> Eve |
| 3 | &nbsp;&nbsp;&nbsp;&nbsp;Charlie | VP Sales | 2 | Alice -> Charlie |

Notice how sorting by `path` automatically groups subtrees in depth-first order (`Alice -> Bob -> David -> Frank -> Eve -> Charlie`).

## 5. Edge Cases — The Ones That Break Naive Solutions

### 1. Data Cycles ($A \rightarrow B \rightarrow C \rightarrow A$)
- **The Trap:** If bad data or manual admin edits cause employee 1 to report to employee 3 while employee 3 is under employee 1, standard recursion loops indefinitely.
- **The Result:** The query hangs until it crashes with `ERROR 3636: Recursive query aborted after 1001 iterations` (MySQL) or consumes all server work memory.
- **The Fix:** Always use cycle tracking (Solution 3) or verify `cte_max_recursion_depth` limits in systems accepting user-edited hierarchies.

### 2. Path String Truncation
- **The Trap:** Writing `SELECT name AS path` in the anchor member. The SQL engine calculates the column type from the Anchor query. If the root name is "Alice" (5 characters), the engine sets the column type to `VARCHAR(5)`.
- **The Result:** Concatenating `Alice -> Bob` in recursive steps either silently truncates to `Alice` or throws a data truncation error.
- **The Fix:** Explicitly cast to a large buffer in the anchor: `CAST(name AS CHAR(1000))` or `name::text`.

### 3. Multiple Roots / Disconnected Forests
- **The Trap:** Assuming there is only one CEO or one root node (`manager_id IS NULL`).
- **The Result:** If an organization has multiple top-level divisions or independent category trees, a query hardcoded to `WHERE id = 1` misses entire branches.
- **The Fix:** The anchor `WHERE manager_id IS NULL` naturally selects all root nodes, running all subtrees in parallel through the CTE.

### 4. Non-Standard Root Representation (`0` or Self-Referencing ID)
- **The Trap:** Some legacy databases store roots as `manager_id = 0` or self-referencing `manager_id = id` instead of `NULL`.
- **The Result:** `WHERE manager_id IS NULL` returns 0 rows, causing the query to produce an empty result. A self-referencing `manager_id = id` also instantly creates an infinite cycle on row 1.
- **The Fix:** Standardize the anchor condition: `WHERE manager_id IS NULL OR manager_id = 0 OR manager_id = id` (and exclude self-joins in the recursive step with `WHERE e.id <> e.manager_id`).

### 5. Orphaned Nodes (Dangling Foreign Keys)
- **The Trap:** If an employee has `manager_id = 999` where ID 999 was deleted from the table.
- **The Result:** Top-down traversal starting from the root silently ignores the orphan and all of that orphan's subordinates.
- **The Fix:** Always enforce referential integrity with foreign key constraints (`FOREIGN KEY (manager_id) REFERENCES Employees(id) ON DELETE SET NULL`).

### 6. Missing Index on Foreign Key
- **The Trap:** Leaving `manager_id` unindexed because primary keys are already indexed.
- **The Result:** Every single level of recursion forces a full table scan of the `Employees` table. For a table of 100,000 rows with 8 hierarchy levels, the query scans 800,000 rows.
- **The Fix:** Ensure an index exists: `CREATE INDEX idx_employees_manager_id ON Employees(manager_id);`.

## 6. Variations and Follow-ups

### Variation 1: Subtree Rollup Aggregations (Total Headcount & Salary per Manager)

Interviewers often follow up with: *"How do you calculate the total salary expense of a manager including all direct and indirect reports?"*

To aggregate across a full subtree, use the CTE to pair every ancestor with all of their descendants, then group by the ancestor:

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

### Variation 2: Alternative Hierarchical Storage Models

When asked to compare how trees can be modeled in relational databases, a senior engineer should compare four primary patterns:

| Model | Schema Pattern | Read Subtree Complexity | Insert / Move Complexity | Best Used When |
|:---|:---|:---|:---|:---|
| **Adjacency List** | `parent_id INT` column | $O(N)$ via Recursive CTE | $O(1)$ single-row update | Standard hierarchies where tree mutations and moves are frequent. |
| **Closure Table** | Separate table `(ancestor, descendant, depth)` | $O(1)$ fast single join: `SELECT * FROM Tree WHERE ancestor = :id` | $O(N)$ updates: must insert relationship rows for all ancestors | Deep, read-heavy trees where fast subtree queries are paramount. |
| **Nested Sets** | `lft INT, rgt INT` boundary columns | $O(1)$ range filter: `WHERE lft BETWEEN p.lft AND p.rgt` | $O(N)$ catastrophic writes: requires re-indexing integer boundaries across the table | Read-only taxonomies (e.g., product catalog categories) with almost zero mutations. |
| **Materialized Path** | `path VARCHAR` column (e.g., `'1/2/4/'`) | $O(1)$ prefix search: `WHERE path LIKE '1/2/%'` | $O(1)$ for leaf inserts, $O(K)$ string update for subtree moves | Systems using PostgreSQL `ltree` extension with GiST indexes. |

## 7. 🧠 The Memory Hook

Think of a Recursive CTE like a **relay race**: the **Anchor** hands the baton to the first generation (root nodes), and each **Recursive Step** passes the baton down to the next generation of children until an iteration comes up empty-handed. 

To keep the race smooth: **CAST the path buffer wide** at the start, **index the `manager_id` foreign key**, and **track visited nodes** so circular references don't turn your relay into an infinite loop.
