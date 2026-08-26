# Write a Query Using Common Table Expressions (CTE) in SQL

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to solve a problem using a Common Table Expression (CTE), they are rarely testing your ability to type the `WITH` keyword. They are testing whether you write SQL like an engineer who builds maintainable, production-grade data pipelines or someone who writes tangled, one-off scripts.

Specifically, the interviewer is evaluating four core competencies:

1. **Modular Query Decomposition:** Can you break down a complex, multi-stage business problem into clean, readable logical units that execute in a clear top-to-bottom sequence?
2. **CTE vs. Derived Tables vs. Temporary Tables:** Do you know when a CTE is superior to deeply nested subqueries (which create unreadable "inside-out" queries) and physical temporary tables (which incur catalog lock overhead, connection state management, and disk I/O)?
3. **Optimizer Mechanics and Materialization:** Do you understand how database query planners treat CTEs? For example, in PostgreSQL 12+ and MySQL 8.0.28+, single-reference CTEs are inlined by default into derived tables. You should know when to enforce an optimization barrier using `AS MATERIALIZED` (to avoid redundant multi-pass evaluations of heavy computations) or `AS NOT MATERIALIZED` (to let the planner push down `WHERE` filters across join boundaries).
4. **Chaining Pipelines:** Can you chain multiple independent CTE blocks where downstream stages consume output from upstream stages without cluttering the global database namespace?

## 2. Think Before You Code — The Senior Dev Thought Process

Let us look at a standard production interview problem:

**The Business Problem:** 
"Given an `Employees` table with columns `id`, `name`, `department_id`, and `salary`, calculate the bonus budget for every department. A department's bonus budget is 10% of the total salary of only those employees who earn strictly more than their department's average salary. The final output must show `department_id`, `eligible_count` (number of qualifying employees), and `total_bonus_budget`."

Here is how a senior engineer breaks this down before writing any code:

First, look at the dependency chain. To know whether Alice gets a bonus, we must compare her salary against her department's average. But the department average does not exist in raw rows—it requires aggregating across all employees in that department. 

A naive impulse might be to write a `WHERE` clause like `WHERE salary > AVG(salary)`. But SQL execution order prevents this: `WHERE` filters individual rows before `GROUP BY` aggregates them.

Next, consider the architectural approaches:

- **Approach 1: Correlated Subquery in WHERE**
  ```sql
  SELECT department_id, COUNT(*), SUM(salary * 0.10)
  FROM Employees e1
  WHERE salary > (
      SELECT AVG(salary) 
      FROM Employees e2 
      WHERE e2.department_id = e1.department_id
  )
  GROUP BY department_id;
  ```
  *Why this is risky:* Unless the optimizer un-correlates this subquery into a hash join, the database evaluates the inner subquery for every single row in `Employees`, turning an $O(N)$ query into an $O(N \times M)$ scan.

- **Approach 2: Deeply Nested Subqueries in FROM**
  You can calculate averages in an inline subquery and join it, but once you add filtering and final grouping, you end up with three layers of nested parentheses. The query reads inside-out, making review and troubleshooting painful.

- **Approach 3: Multi-Stage CTE Pipeline (Optimal)**
  We construct a sequential three-stage pipeline:
  1. `DeptAverages`: Group by `department_id` once to compute the average salary per department.
  2. `AboveAvgEmployees`: Join `Employees` with `DeptAverages` and filter rows where `salary > avg_salary`.
  3. `Final Query`: Group the filtered qualifying employees by `department_id` and compute `COUNT(*)` and `SUM(salary * 0.10)`.

This reads like functional programming: Input $\to$ Transform 1 $\to$ Transform 2 $\to$ Final Output.

## 3. The Solution — Fully Explained Code

Here is the complete, production-ready SQL query:

```sql
-- Stage 1: Calculate the average salary for each department
WITH DeptAverages AS (
    SELECT 
        department_id, 
        AVG(salary) AS avg_salary 
    FROM Employees 
    GROUP BY department_id
),

-- Stage 2: Filter employees who earn strictly more than their department's average
AboveAvgEmployees AS (
    SELECT 
        e.id, 
        e.name, 
        e.department_id, 
        e.salary, 
        d.avg_salary 
    FROM Employees e 
    INNER JOIN DeptAverages d 
        ON e.department_id = d.department_id 
    WHERE e.salary > d.avg_salary
)

-- Stage 3: Aggregate bonus pool metrics for eligible employees per department
SELECT 
    department_id, 
    COUNT(*) AS eligible_count, 
    SUM(salary * 0.10) AS total_bonus_budget 
FROM AboveAvgEmployees 
GROUP BY department_id;
```

### Complexity Analysis

- **Time Complexity:** $O(N)$ with hash aggregation and hash joins (or $O(N \log N)$ if sorting is used).
  - Stage 1 performs a single pass over $N$ employee rows to build a hash table of $D$ departments with their average salaries ($O(N)$).
  - Stage 2 probes the $D$-department hash table for each of the $N$ employee rows and applies the filter condition ($O(N)$).
  - Stage 3 aggregates only the qualifying rows $K$ ($K \le N$) into the final departmental buckets ($O(K)$).
  - Total time scales linearly with the number of employee rows $N$.

- **Space / Memory Complexity:** $O(D)$ intermediate memory, where $D$ is the number of distinct departments.
  - The intermediate result `DeptAverages` holds only $D$ rows in memory (inside `work_mem` in PostgreSQL or sort/hash buffers in MySQL). The intermediate stream `AboveAvgEmployees` streams directly into the final aggregation without requiring full disk materialization.

## 4. Dry Run — Walk Through a Real Example

Let us trace the query execution using a sample `Employees` dataset.

### Sample Input Data (`Employees`)

| id | name | department_id | salary |
|---|---|---|---|
| 1 | Alice | 101 | 90,000 |
| 2 | Bob | 101 | 70,000 |
| 3 | Charlie | 101 | 80,000 |
| 4 | David | 102 | 120,000 |
| 5 | Emma | 102 | 100,000 |
| 6 | Frank | 103 | 60,000 |

---

### Step 1: Evaluating `DeptAverages`

The engine scans `Employees` and groups rows by `department_id`:
- Dept 101: $(90,000 + 70,000 + 80,000) / 3 = 80,000$
- Dept 102: $(120,000 + 100,000) / 2 = 110,000$
- Dept 103: $60,000 / 1 = 60,000$

**`DeptAverages` Virtual Result:**

| department_id | avg_salary |
|---|---|
| 101 | 80,000 |
| 102 | 110,000 |
| 103 | 60,000 |

---

### Step 2: Evaluating `AboveAvgEmployees`

The engine joins `Employees` to `DeptAverages` on `department_id` and evaluates `salary > avg_salary`:
- Alice (101): $90,000 > 80,000 \implies$ **MATCH** (Kept)
- Bob (101): $70,000 > 80,000 \implies$ False (Filtered out)
- Charlie (101): $80,000 > 80,000 \implies$ False (Filtered out; strict inequality)
- David (102): $120,000 > 110,000 \implies$ **MATCH** (Kept)
- Emma (102): $100,000 > 110,000 \implies$ False (Filtered out)
- Frank (103): $60,000 > 60,000 \implies$ False (Filtered out; single employee is equal to average)

**`AboveAvgEmployees` Virtual Result:**

| id | name | department_id | salary | avg_salary |
|---|---|---|---|---|
| 1 | Alice | 101 | 90,000 | 80,000 |
| 4 | David | 102 | 120,000 | 110,000 |

---

### Step 3: Final Aggregation

The outer query aggregates the 2 surviving rows by `department_id`:
- **Department 101:** 1 employee (Alice), `COUNT(*)` = 1, `SUM(90,000 * 0.10)` = 9,000.
- **Department 102:** 1 employee (David), `COUNT(*)` = 1, `SUM(120,000 * 0.10)` = 12,000.
- **Department 103:** 0 qualifying rows exist, so it produces no rows in an `INNER JOIN` grouping.

**Final Output:**

| department_id | eligible_count | total_bonus_budget |
|---|---|---|
| 101 | 1 | 9000.00 |
| 102 | 1 | 12000.00 |

## 5. Edge Cases — The Ones That Break Naive Solutions

Here are the real-world traps that break naive SQL implementations:

1. **Single-Employee Departments:**
   - *Trap:* If a department has exactly one employee (like Frank in Dept 103), that employee's salary equals the department average. Since the filter condition is strictly greater (`>`), the employee is excluded.
   - *Fix:* If business requirements state that departments with no qualifying employees must still appear with `0` budget, start from a master `Departments` table and use `LEFT JOIN` with `COALESCE(SUM(salary * 0.10), 0)`.

2. **Zero Salary Variance Across Department:**
   - *Trap:* If all employees in department 200 earn exactly $100,000, the average is $100,000. No employee earns *strictly* above average, so the department produces zero bonus budget. A naive query using `>=` instead of `>` would incorrectly grant bonuses to everyone.

3. **`NULL` Values in Salaries or Department IDs:**
   - *Trap:* SQL aggregate functions like `AVG()` automatically skip `NULL` values. If an entire department has `NULL` salaries, `AVG(salary)` evaluates to `NULL`. The comparison `salary > NULL` yields `UNKNOWN`, which evaluates to false in a `WHERE` clause.
   - *Trap with unassigned departments:* Employees with `department_id IS NULL` will fail the join condition `e.department_id = d.department_id` because `NULL = NULL` is `UNKNOWN`. Ensure data sanitization upstream or handle unassigned staff explicitly.

4. **Floating Point Rounding Errors:**
   - *Trap:* Using floating-point types (`FLOAT` / `REAL`) for salaries causes precision drift (for example, `9000.000000000002`).
   - *Fix:* Always cast monetary figures to `NUMERIC(12, 2)` or `DECIMAL(12, 2)` and wrap the final calculation in `ROUND(..., 2)`.

5. **Optimization Barrier Hazards (Materialization Pitfall):**
   - *Trap:* In PostgreSQL versions prior to 12, every CTE acted as an optimization barrier. The engine wrote the full CTE result to a temporary in-memory buffer before continuing, preventing the query planner from pushing outer `WHERE` conditions down into the CTE scan.
   - *Fix:* In modern databases, single-use CTEs are automatically inlined. If you are using PostgreSQL 12+ and want to guarantee inlining for predicate pushdown, write `WITH DeptAverages AS NOT MATERIALIZED (...)`.

## 6. Variations and Follow-ups

During an interview, a senior interviewer will frequently introduce variations to test the boundaries of your SQL knowledge:

### Variation 1: The Window Function Alternative

"Can you solve this without self-joining the table in a CTE?"

Yes. You can calculate the department average inline using the `AVG() OVER (PARTITION BY ...)` window function. However, because SQL forbids window functions directly inside a `WHERE` clause, you still wrap the window calculation in a CTE:

```sql
WITH EmployeesWithDeptAvg AS (
    SELECT 
        id, 
        department_id, 
        salary, 
        AVG(salary) OVER(PARTITION BY department_id) AS dept_avg
    FROM Employees
)
SELECT 
    department_id, 
    COUNT(*) AS eligible_count, 
    SUM(salary * 0.10) AS total_bonus_budget 
FROM EmployeesWithDeptAvg 
WHERE salary > dept_avg 
GROUP BY department_id;
```
*Trade-off:* This eliminates the explicit `JOIN` condition and scans `Employees` once, sorting or hashing by `department_id` in a single execution node.

### Variation 2: Writable CTEs for Atomic Data Movement

"How would you archive and purge terminated employees in a single atomic transaction without writing a stored procedure?"

In PostgreSQL, CTEs can contain data-modifying statements (`INSERT`, `UPDATE`, `DELETE`) with a `RETURNING` clause:

```sql
WITH DeletedEmployees AS (
    DELETE FROM Employees 
    WHERE status = 'terminated' 
      AND termination_date < NOW() - INTERVAL '1 year' 
    RETURNING id, name, department_id, salary, termination_date
)
INSERT INTO EmployeeArchive (id, name, department_id, salary, archived_at) 
SELECT id, name, department_id, salary, NOW() 
FROM DeletedEmployees;
```
*Why this matters:* The `DELETE` and `INSERT` execute in a single snapshot isolation context. No separate transaction script or external locking is required.

### Variation 3: Recursive CTEs for Hierarchical Data

"What if departments are organized in an organizational hierarchy where a department can have sub-departments?"

Recursive CTEs use an anchor query followed by `UNION ALL` and a recursive query:

```sql
WITH RECURSIVE DepartmentHierarchy AS (
    -- Anchor member: find top-level parent departments
    SELECT id, name, parent_id, 1 AS depth 
    FROM Departments 
    WHERE parent_id IS NULL
    
    UNION ALL
    
    -- Recursive member: join child departments to parent results
    SELECT d.id, d.name, d.parent_id, dh.depth + 1 
    FROM Departments d 
    INNER JOIN DepartmentHierarchy dh 
        ON d.parent_id = dh.id
)
SELECT * FROM DepartmentHierarchy;
```

### Variation 4: Multi-Reference CTEs and `MATERIALIZED` Hints

If a CTE is referenced three or four times across different `UNION` branches or joins, re-evaluating it repeatedly wastes CPU cycles. You can force the database to materialize the result set once into temporary memory:

```sql
WITH ExpensiveAggregates AS MATERIALIZED (
    SELECT department_id, SUM(salary) AS total_spend, COUNT(*) AS head_count
    FROM Employees
    GROUP BY department_id
)
SELECT * FROM ExpensiveAggregates WHERE total_spend > 500000
UNION ALL
SELECT * FROM ExpensiveAggregates WHERE head_count > 50;
```

## 7. 🧠 The Memory Hook

Think of CTEs as **labeled assembly line bins**: each `WITH` block takes raw materials, performs one clear transformation, and places the clean output into a named bin for the next station to use. 

Use CTEs to turn confusing inside-out subqueries into clean top-to-bottom pipelines. Remember that modern database optimizers inline single-reference CTEs for free unless you explicitly command them to materialize.

