# Write a Query Using Subqueries in SQL: Scalar, Correlated, and Derived Tables

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using subqueries, they are rarely testing whether you know how to put parentheses inside a `SELECT` statement. They are testing whether you understand SQL's declarative execution model, how intermediate scopes isolate data, and how different subquery structures alter query engine performance from $O(N)$ to $O(N^2)$.

Candidates frequently confuse different subquery structures, causing execution errors or severe database lockups in production. A senior engineer categorizes subqueries by their return shape and execution dependency:

- **Scalar Subquery:** Returns exactly one row and one column (a single atomic value). It can be placed anywhere an expression or literal constant is valid: `SELECT`, `WHERE`, `HAVING`, and `ORDER BY`.
- **Column / Multi-Row Subquery:** Returns a single column containing multiple rows. It is evaluated with set-membership operators like `IN`, `NOT IN`, `ANY`, `ALL`, or `EXISTS`.
- **Table / Derived Table Subquery (Inline View):** Placed in the `FROM` or `JOIN` clause. It creates an anonymous in-memory temporary table that exists only for the duration of the query. ANSI SQL strictly mandates that every derived table must have an explicit alias.
- **Correlated Subquery:** An inner query that references one or more columns from the outer query table alias. Because it depends on outer row values, the database conceptually re-evaluates the inner query once for every candidate row evaluated by the outer query.

Beyond syntax, the interviewer is evaluating your awareness of the optimizer:
- **The Performance Cliff:** An independent subquery runs once. A naive correlated subquery on unindexed columns transforms an $O(N)$ linear scan into an $O(N \times M)$ nested-loop catastrophe.
- **Optimizer Decorrelation and Unnesting:** Modern database optimizers (such as PostgreSQL's cost-based optimizer or MySQL 8.0's hypergraph engine) attempt to rewrite correlated subqueries into hash joins, semi-joins, or window functions. Knowing when the engine can unnest—and when you must manually refactor to a `JOIN` or Common Table Expression (CTE)—separates senior engineers from juniors.

## 2. Think Before You Code — The Senior Dev Thought Process

When presented with questions like "Find all products priced above the catalog average" or "Find employees earning more than their department's average," walking through the reasoning out loud signals architectural maturity.

First, determine if the calculation is global or partitioned:
- If the calculation is global (e.g., the average price across all products), the inner query does not depend on the outer row. An independent scalar subquery is optimal because the database calculates the scalar once, caches it in an execution step (like an `InitPlan` in PostgreSQL), and filters the table in a single linear pass.
- If the calculation is partitioned by a group (e.g., department average salary), each employee must be compared against their own department's specific average.

Next, decide between a correlated subquery, a pre-aggregated derived table, or a window function:
- A correlated subquery in the `WHERE` clause is the most direct conceptual translation: "Select this employee where their salary is greater than the average salary of employees sharing their `department_id`."
- However, if the `Employees` table has millions of rows and no index on `department_id`, the database may execute millions of sub-selects.
- To prevent row-by-row execution, we can pre-aggregate department statistics inside a derived table (inline view in `FROM`/`JOIN`) or use a Common Table Expression (CTE). This computes every department average in one pass and joins the pre-computed relation back to the employee records.

Before writing the query, verify three mechanical rules:
1. Does the scalar subquery guarantee at most one row? If a scalar subquery can ever return two rows at runtime, the query engine aborts with a fatal runtime error.
2. Are derived tables aliased? Every inline table in the `FROM` clause must have a distinct alias name.
3. How will `NULL` values behave? If an aggregate runs over empty rows or nullable columns, SQL's three-valued logic (`TRUE`, `FALSE`, `UNKNOWN`) will treat comparisons against `NULL` as `UNKNOWN` and exclude rows.

## 3. The Solution — Fully Explained Code

Below are the production schemas and the three standard subquery patterns required in technical interviews, along with an analysis of their execution mechanics.

**Database Schema Setup:**

```sql
CREATE TABLE Products (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL
);

CREATE TABLE Employees (
    id INT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    department_id INT NOT NULL,
    salary DECIMAL(10, 2) NOT NULL
);

CREATE INDEX idx_emp_dept_salary ON Employees(department_id, salary);
```

**Problem 1: Scalar Subquery (Independent)**

Find all products priced strictly higher than the global catalog average price.

```sql
SELECT 
    id, 
    name, 
    price 
FROM Products 
WHERE price > (
    -- Independent scalar subquery: Evaluated once globally
    SELECT AVG(price) 
    FROM Products
);
```

- **Time Complexity:** $O(N)$. The subquery performs one full table scan or index scan over $N$ rows to compute `AVG(price)`. The outer query scans $N$ rows and compares each `price` against the pre-calculated constant scalar.
- **Space Complexity:** $O(1)$ temporary memory to store the single scalar aggregate value in the query execution buffer.

**Problem 2: Correlated Subquery**

Find all employees whose salary is strictly greater than the average salary of their specific department.

```sql
SELECT 
    e.id, 
    e.name, 
    e.department_id, 
    e.salary 
FROM Employees e 
WHERE e.salary > (
    -- Correlated subquery: References outer row alias 'e.department_id'
    -- Conceptually re-evaluated for each candidate row in 'e'
    SELECT AVG(sub.salary) 
    FROM Employees sub 
    WHERE sub.department_id = e.department_id
);
```

- **Time Complexity:** $O(N \log M)$ when an index on `(department_id, salary)` exists (where $N$ is total employees and $M$ is department size). Without an index, this degrades to $O(N \times M)$ due to repeated table scans per row. Modern query planners with decorrelation convert this into an $O(N)$ Hash Aggregate and Hash Join.
- **Space Complexity:** $O(1)$ if executed via nested-loop with index; $O(D)$ where $D$ is the number of distinct departments if the optimizer decorrelates into an in-memory hash table.

**Problem 3: Derived Table (Inline View) with Pre-Aggregation and Pagination**

Retrieve employees earning above their department average, alongside their department's summary statistics, sorted by salary with safe pagination.

```sql
SELECT 
    e.id,
    e.name,
    e.department_id,
    e.salary,
    ROUND(dept_summary.avg_salary, 2) AS dept_avg_salary,
    dept_summary.total_employees AS dept_headcount
FROM Employees e
-- Derived Table: Pre-aggregates department metrics in a single pass
INNER JOIN (
    SELECT 
        department_id,
        AVG(salary) AS avg_salary,
        COUNT(*) AS total_employees
    FROM Employees
    GROUP BY department_id
) AS dept_summary 
    ON e.department_id = dept_summary.department_id
WHERE e.salary > dept_summary.avg_salary
ORDER BY e.salary DESC
LIMIT 10 OFFSET 0;
```

- **Time Complexity:** $O(N \log N)$ driven primarily by the final `ORDER BY` sort. The derived table computes department aggregates in one $O(N)$ scan using a hash table, and the join matches $N$ records in $O(1)$ per row.
- **Space Complexity:** $O(D)$ memory to materialize the derived aggregation table in memory, where $D$ is the count of distinct departments.

**Execution Plan Analysis & Optimizer Mechanics:**

When running `EXPLAIN ANALYZE` on these queries:

In Problem 1, the query planner creates an `InitPlan` node. The inner aggregate `AVG(price)` executes exactly once before the outer scan begins. The resulting value is passed as a literal parameter to the outer `Seq Scan` / `Index Scan`.

In Problem 2, older engines generate a `SubPlan` node attached to the filter condition, executing the inner query repeatedly for each row of the outer table. Modern engines (PostgreSQL 12+, MySQL 8.0.24+) detect the equality condition `sub.department_id = e.department_id`, decorrelate the subquery into a subquery unnesting step, and transform the operation into an internal `Hash Join` against a `HashAggregate`.

In Problem 3, the derived table is explicitly declared as a relation. The query planner either merges the derived table into the main plan or executes it as a materialized subquery scan, avoiding any possibility of row-by-row nested loop overhead.

## 4. Dry Run — Walk Through a Real Example

Let us trace the Correlated Subquery (Problem 2) on sample data from the `Employees` table.

**Sample Data (`Employees`):**

| id | name | department_id | salary |
| :--- | :--- | :--- | :--- |
| 1 | Alice | 10 | 95000.00 |
| 2 | Bob | 10 | 80000.00 |
| 3 | Charlie | 10 | 65000.00 |
| 4 | Diana | 20 | 120000.00 |
| 5 | Evan | 20 | 130000.00 |

**Step-by-Step Execution Trace:**

**Row 1 (Alice):**
- Candidate row: `id = 1, department_id = 10, salary = 95000.00`.
- Outer parameter `e.department_id` is bound to `10`.
- Inner query executes: `SELECT AVG(salary) FROM Employees WHERE department_id = 10`.
- Salaries for department 10: `[95000, 80000, 65000]`. Average = `80000.00`.
- Predicate check: `95000.00 > 80000.00` evaluates to `TRUE`.
- **Result:** Alice is included.

**Row 2 (Bob):**
- Candidate row: `id = 2, department_id = 10, salary = 80000.00`.
- Outer parameter `e.department_id` is bound to `10`.
- Inner query returns average `80000.00`.
- Predicate check: `80000.00 > 80000.00` evaluates to `FALSE` (strict inequality).
- **Result:** Bob is excluded.

**Row 3 (Charlie):**
- Candidate row: `id = 3, department_id = 10, salary = 65000.00`.
- Outer parameter `e.department_id` is bound to `10`.
- Inner query returns average `80000.00`.
- Predicate check: `65000.00 > 80000.00` evaluates to `FALSE`.
- **Result:** Charlie is excluded.

**Row 4 (Diana):**
- Candidate row: `id = 4, department_id = 20, salary = 120000.00`.
- Outer parameter `e.department_id` is bound to `20`.
- Inner query executes: `SELECT AVG(salary) FROM Employees WHERE department_id = 20`.
- Salaries for department 20: `[120000, 130000]`. Average = `125000.00`.
- Predicate check: `120000.00 > 125000.00` evaluates to `FALSE`.
- **Result:** Diana is excluded.

**Row 5 (Evan):**
- Candidate row: `id = 5, department_id = 20, salary = 130000.00`.
- Outer parameter `e.department_id` is bound to `20`.
- Inner query returns average `125000.00`.
- Predicate check: `130000.00 > 125000.00` evaluates to `TRUE`.
- **Result:** Evan is included.

**Final Result Set:**

| id | name | department_id | salary |
| :--- | :--- | :--- | :--- |
| 1 | Alice | 10 | 95000.00 |
| 5 | Evan | 20 | 130000.00 |

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Scalar Subquery Returning More Than One Row**
If a subquery used in a comparison operator (`=`, `>`, `<`) returns multiple rows, the database cannot compare a single scalar to a set of rows.
```sql
-- DANGEROUS: If category 'Electronics' has multiple items, this crashes
SELECT id, name FROM Products 
WHERE price = (SELECT price FROM Products WHERE category = 'Electronics');
```
- **Error:** PostgreSQL throws `ERROR: more than one row returned by a subquery used as an expression`. MySQL throws `ERROR 1242 (21000): Subquery returns more than 1 row`.
- **Prevention:** Always ensure uniqueness via aggregate functions (`MAX()`, `MIN()`, `AVG()`), a unique column filter (`WHERE id = 42`), or explicit row limiting (`LIMIT 1`). If multiple values are valid, use set operators (`WHERE price IN (...)` or `WHERE price > ALL (...)`).

**2. Scalar Subquery Returning Zero Rows (NULL Coalescing)**
When a scalar subquery matches zero rows, it evaluates to `NULL`, not `0` or an empty string.
```sql
SELECT id, name FROM Products 
WHERE price > (SELECT AVG(price) FROM Products WHERE category = 'NonExistentCategory');
```
- **Behavior:** The subquery evaluates to `NULL`. Under SQL three-valued logic, `price > NULL` evaluates to `UNKNOWN`. In a `WHERE` clause, `UNKNOWN` conditions are treated as false and silently discard all rows.
- **Prevention:** Wrap subqueries that may return empty sets in `COALESCE`: `WHERE price > COALESCE((SELECT AVG(price) FROM ...), 0)`.

**3. The `NOT IN` with `NULL` Disaster**
If a subquery evaluated inside a `NOT IN` predicate returns even a single row containing `NULL`, the entire outer query returns zero results.
```sql
-- DANGEROUS: If any employee has department_id IS NULL, this returns ZERO rows!
SELECT id, name FROM Employees 
WHERE department_id NOT IN (SELECT department_id FROM DepartmentAudits);
```
- **Why it breaks:** `x NOT IN (10, 20, NULL)` expands logically to `(x != 10 AND x != 20 AND x != NULL)`. Since `x != NULL` evaluates to `UNKNOWN`, `TRUE AND TRUE AND UNKNOWN` evaluates to `UNKNOWN`. The `WHERE` clause drops every candidate row.
- **Prevention:** Always use `NOT EXISTS` instead of `NOT IN`, or explicitly exclude `NULL` in the subquery: `WHERE department_id IS NOT NULL`.

**4. Single-Member Groups in Correlated Subqueries**
If a department contains only one employee, that employee's salary is equal to the department average (`salary = AVG(salary)`). The condition `salary > AVG(salary)` evaluates to `FALSE`. In an interview, clarify whether the requirement specifies "strictly greater than" (`>`) or "greater than or equal to" (`>=`).

**5. Missing Derived Table Aliases**
In SQL standard ANSI-92, every derived table in a `FROM` or `JOIN` clause must have an alias. Writing `SELECT * FROM (SELECT id FROM Products)` without an alias triggers a syntax error (`ERROR 1248 (42000): Every derived table must have its own alias` in MySQL). Always append `AS sub_table_alias`.

## 6. Variations and Follow-ups

**Variation 1: The Modern Window Function Approach**

Interviewers often ask: "Can you write this without a subquery in the `WHERE` clause or without a self-join?"

Using SQL Window Functions (`AVG() OVER`), you compute the department average in the same scan without repeated lookups. Because window functions cannot appear directly in a `WHERE` clause, wrap the calculation in a Common Table Expression (CTE):

```sql
WITH RankedEmployees AS (
    SELECT 
        id, 
        name, 
        department_id, 
        salary,
        AVG(salary) OVER(PARTITION BY department_id) AS dept_avg_salary
    FROM Employees
)
SELECT 
    id, 
    name, 
    department_id, 
    salary 
FROM RankedEmployees
WHERE salary > dept_avg_salary;
```
- **Trade-off:** The window function computes partition aggregates during a single sorting pass ($O(N \log N)$), eliminating table self-joins entirely.

**Variation 2: `EXISTS` vs `IN` for Semi-Joins**

When filtering rows based on existence in another table:

```sql
-- Using IN:
SELECT id, name FROM Customers 
WHERE id IN (SELECT customer_id FROM Orders);

-- Using Correlated EXISTS:
SELECT c.id, c.name FROM Customers c 
WHERE EXISTS (
    SELECT 1 FROM Orders o WHERE o.customer_id = c.id
);
```
- **Trade-off:** `EXISTS` short-circuits as soon as the first matching record is found in the index, whereas un-optimized `IN` subqueries may attempt to collect the entire distinct value list before evaluating the filter. `EXISTS` is also null-safe, avoiding the `NOT IN (NULL)` trap.

**Variation 3: Lateral Subqueries (Parameterized Derived Tables)**

Standard derived tables cannot reference columns from preceding tables in the `FROM` list. PostgreSQL and MySQL 8.0.14+ support `LATERAL` joins (equivalent to SQL Server's `CROSS APPLY`):

```sql
-- Find each department alongside its top 2 highest paid employees
SELECT 
    d.id AS dept_id,
    d.name AS dept_name,
    top_emp.name AS employee_name,
    top_emp.salary
FROM Departments d
CROSS JOIN LATERAL (
    SELECT name, salary 
    FROM Employees e 
    WHERE e.department_id = d.id 
    ORDER BY salary DESC 
    LIMIT 2
) AS top_emp;
```
- **Trade-off:** Allows a derived table to behave like a correlated subquery inside the `FROM` clause, ideal for "Top-N per group" queries with `LIMIT`.

## 7. 🧠 The Memory Hook

To choose and optimize subqueries under pressure, remember the three spatial roles:

- **Scalar Subquery:** Returns a single point (1x1). Safe in `SELECT` and `WHERE`, but will crash if it returns two points.
- **Correlated Subquery:** Looks outward at the parent row. Conceptually loops row-by-row unless the optimizer un-nests it into a join.
- **Derived Table:** An in-memory temporary relation in `FROM`. Must always have an alias, and pre-aggregates data to protect against $O(N^2)$ nested loops.
