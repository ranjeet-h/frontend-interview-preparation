# Write a Query to Get the Second Highest Salary in SQL

## 1. What the Interviewer Is Really Testing

This looks like a trivial SQL filtering puzzle, but interviewers use it as an early filter to test whether you write production-grade queries or fragile interview scripts. 

Specifically, the interviewer is evaluating three core database competencies:

1. **Deduplication and Tie Handling:** In real-world data, multiple employees frequently earn the same top salary. A naive query that skips one row instead of skipping the highest distinct value will incorrectly return the first highest salary again.
2. **Result Set Contract and NULL Handling:** If a table has only one employee, no employees, or all identical salaries, there is no second highest salary. A junior query returns zero rows (an empty result set), which causes backend database drivers and ORMs to throw missing-record exceptions. A senior query guarantees a single row with `NULL` as the scalar value (`{"SecondHighestSalary": null}`).
3. **Extensibility and Scaling Trade-offs:** Can you explain why a simple `MAX()` subquery is fast and ANSI-compliant for the 2nd rank, but why window functions like `DENSE_RANK()` are mandatory once the requirement scales to the $N$-th rank or per-department groupings?

## 2. Think Before You Code — The Senior Dev Thought Process

When approaching this problem on a whiteboard, walk through the failure points of naive intuition before writing the final SQL.

The instinctive first thought is simple pagination: sort descending and skip the first record:

```sql
SELECT salary FROM Employee ORDER BY salary DESC LIMIT 1 OFFSET 1;
```

This immediately breaks on two counts:
- If salaries are `[100000, 100000, 80000]`, skipping row 0 lands on row 1, returning `100000`. You returned the highest salary, not the second highest.
- If the table contains only `[100000]`, this query returns an empty table (0 rows). The caller expected a single scalar cell containing `NULL`.

To fix deduplication, add `DISTINCT`. To fix the empty result set, wrap the statement inside an outer scalar `SELECT (...) AS SecondHighestSalary` or use `IFNULL()`. In SQL, evaluating an empty subquery inside a `SELECT` projection automatically coerces the missing value to `NULL`.

From an architectural standpoint, there are three standard ways to solve this in production:
1. **The Subquery `MAX()` Approach:** Find the overall maximum, filter it out with `WHERE salary < MAX`, and take the maximum of what is left. It is pure ANSI SQL, runs on every database engine since SQL-92, and returns `NULL` naturally if no rows remain.
2. **The Window Function Approach (`DENSE_RANK`):** Group duplicate values into the same rank tier without skipping rank numbers. This is the cleanest, production-standard pattern when you need the $N$-th rank or need to retrieve the employee's name and department alongside their pay.
3. **The `DISTINCT` + `LIMIT/OFFSET` Approach:** Fast and intuitive for MySQL/PostgreSQL, wrapped in a scalar subquery to preserve the `NULL` contract.

## 3. The Solution — Fully Explained Code

Assume the standard `Employee` schema:

```sql
CREATE TABLE Employee (
    id INT PRIMARY KEY,
    salary INT
);
```

**Approach 1: Subquery with `MAX()` (Most Compatible & Idiomatic for Rank 2)**

```sql
SELECT MAX(salary) AS SecondHighestSalary
FROM Employee
WHERE salary < (
    -- Step 1: Find the absolute maximum salary in the table
    SELECT MAX(salary)
    FROM Employee
);
```

- **How it works:** The inner subquery identifies the top salary. The outer query ignores all instances of that top salary via `WHERE salary < ...`. It then computes `MAX()` over the remaining rows. If no rows remain (for instance, if the table only had 1 distinct salary), SQL aggregate functions over empty sets naturally evaluate to `NULL`.
- **Time Complexity:** $O(N)$ with a full table scan, or $O(\log N)$ / $O(1)$ if an index exists on `salary` because the database engine can read the two highest values directly from the index tree.
- **Space Complexity:** $O(1)$ auxiliary space since only running maximum scalars are tracked in memory.

**Approach 2: Window Function with `DENSE_RANK()` (Production Standard for Nth Rank)**

```sql
WITH RankedSalaries AS (
    SELECT 
        salary,
        -- DENSE_RANK assigns identical ranks to ties and does NOT skip numbers (1, 1, 2, 3...)
        DENSE_RANK() OVER (ORDER BY salary DESC) AS ranking
    FROM Employee
)
SELECT MAX(salary) AS SecondHighestSalary
FROM RankedSalaries
WHERE ranking = 2;
```

- **How it works:** `DENSE_RANK()` assigns rank 1 to the highest salary. If multiple employees share that salary, all receive rank 1, and the next distinct salary receives rank 2. The outer query filters for `ranking = 2`. Wrapping the final projection in `MAX(salary)` guarantees that if rank 2 does not exist, the query outputs `NULL` instead of an empty set.
- **Time Complexity:** $O(N \log N)$ to sort and partition rows in memory, or $O(N)$ if scanning a pre-sorted B-tree index.
- **Space Complexity:** $O(N)$ to materialize the intermediate CTE result set.

**Approach 3: `DISTINCT` with `LIMIT/OFFSET` (Fast Engine-Level Pagination)**

```sql
SELECT (
    -- Subquery wrapped inside outer SELECT to coerce empty set into NULL
    SELECT DISTINCT salary
    FROM Employee
    ORDER BY salary DESC
    LIMIT 1 OFFSET 1
) AS SecondHighestSalary;
```

- **How it works:** `DISTINCT` strips duplicates so each salary tier appears once. `ORDER BY salary DESC LIMIT 1 OFFSET 1` skips the first highest salary and takes the second. The surrounding `SELECT (...) AS SecondHighestSalary` turns a 0-row subquery return into a 1-row `NULL` output.
- **Time Complexity:** $O(N \log N)$ for distinct sorting, or $O(1)$ with a descending B-tree index.
- **Space Complexity:** $O(N)$ temporary memory buffer for sorting distinct values when unindexed.

## 4. Dry Run — Walk Through a Real Example

Let us trace the three approaches using a sample dataset with duplicate top earners:

**Input Table: `Employee`**

| id | salary |
| :--- | :--- |
| 1 | 300 |
| 2 | 300 |
| 3 | 200 |
| 4 | 100 |

**Trace 1: Subquery with `MAX()`**
1. Inner query executes: `SELECT MAX(salary) FROM Employee` evaluates against `{300, 300, 200, 100}` and returns `300`.
2. Outer filter applies: `WHERE salary < 300`. Rows with id 1 and 2 are eliminated. Remaining set is `{200, 100}`.
3. Outer aggregation executes: `SELECT MAX(salary)` on `{200, 100}` returns `200`.
4. Output: `SecondHighestSalary = 200`.

**Trace 2: Window Function `DENSE_RANK()`**

The CTE calculates the window function over the dataset sorted descending:

| id | salary | `ROW_NUMBER()` (Wrong) | `RANK()` (Wrong) | `DENSE_RANK()` (Correct) |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 300 | 1 | 1 | 1 |
| 2 | 300 | 2 | 1 | 1 |
| 3 | 200 | 3 | 3 | 2 |
| 4 | 100 | 4 | 4 | 3 |

Notice why other window functions fail:
- `ROW_NUMBER()` gave employee 2 rank 2, treating a duplicate 300 as the second highest salary.
- `RANK()` skipped rank 2 completely due to the tie at rank 1.
- `DENSE_RANK()` assigned rank 2 to 200. Filtering `WHERE ranking = 2` accurately returns `200`.

**Trace 3: Edge Case Dry Run (Single-Row Table)**

Suppose the table only contains `[{id: 1, salary: 500}]`.
- Subquery approach: Inner `MAX` = 500. `WHERE salary < 500` yields an empty set. `MAX()` on an empty set yields `NULL`.
- CTE approach: CTE produces one row with `ranking = 1`. Outer `WHERE ranking = 2` yields no rows. `MAX(salary)` on no rows evaluates to `NULL`.
- Scalar wrapper approach: Inner subquery yields 0 rows. The outer scalar projection evaluates the empty subquery to `NULL`.

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Table Contains Only One Row (or Zero Rows)**
- **Why it breaks naive code:** A bare `LIMIT 1 OFFSET 1` produces an empty result set (0 rows). If an API gateway or backend microservice expects a single record with a value (even if null), reading the first row of an empty result set throws an out-of-bounds error or `RowNotFoundError`.
- **The fix:** Always use aggregate functions (`MAX()`) or wrap scalar subqueries in an outer `SELECT (...)`.

**2. All Employees Have the Exact Same Salary**
- **Why it breaks naive code:** If five employees all earn $90,000, there is no second highest distinct salary. A query without deduplication will return $90,000 as the second highest.
- **The fix:** `WHERE salary < (SELECT MAX...)` eliminates all rows matching the maximum value. If all rows match, zero rows pass the filter, correctly resulting in `NULL`.

**3. The `salary` Column Contains `NULL`s**
- **Why it breaks naive code:** In SQL three-valued logic, comparing any value to `NULL` (such as `salary < 500` or `salary = 500`) evaluates to `UNKNOWN`, which is treated as false in `WHERE` clauses. Furthermore, `ORDER BY salary DESC` sorts `NULL`s first in PostgreSQL and Oracle by default, corrupting `LIMIT/OFFSET` logic unless `NULLS LAST` is specified.
- **The fix:** SQL aggregate functions like `MAX()` automatically ignore `NULL` values during calculation.

## 6. Variations and Follow-ups

**Variation 1: Find the Nth Highest Salary**
When the interviewer asks: *"How would you generalize this to find the Nth highest salary for any arbitrary N?"*

The subquery `MAX()` approach requires $N-1$ nested subqueries, which quickly becomes unmanageable. The `DENSE_RANK()` CTE scales cleanly by replacing the literal rank with a parameter `$N`:

```sql
WITH RankedSalaries AS (
    SELECT 
        salary,
        DENSE_RANK() OVER (ORDER BY salary DESC) AS ranking
    FROM Employee
)
SELECT MAX(salary) AS NthHighestSalary
FROM RankedSalaries
WHERE ranking = $N;
```

**Variation 2: Return Employee Details (Name, Department) with the Salary**
When the interviewer asks: *"Return the employee name and ID who earns the second highest salary."*

A simple `SELECT MAX(salary)` cannot return employee names without an expensive secondary join because `MAX()` aggregates all rows into one. The window function handles this naturally:

```sql
WITH RankedEmployees AS (
    SELECT 
        id,
        name,
        salary,
        department_id,
        DENSE_RANK() OVER (ORDER BY salary DESC) AS ranking
    FROM Employee
)
SELECT id, name, department_id, salary
FROM RankedEmployees
WHERE ranking = 2;
```

**Variation 3: Second Highest Salary Per Department**
When the interviewer asks: *"Find the second highest salary within every individual department."*

Add `PARTITION BY` to the window function:

```sql
WITH RankedDepartmentSalaries AS (
    SELECT 
        department_id,
        salary,
        DENSE_RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) AS ranking
    FROM Employee
)
SELECT department_id, salary AS SecondHighestSalary
FROM RankedDepartmentSalaries
WHERE ranking = 2;
```

**Variation 4: Production Index Optimization for Large Tables**
On a table with 50 million rows, queries using `ORDER BY salary DESC` or unindexed `MAX()` require full table scans or disk-based sorting.
- Create a descending B-tree index on the salary column:
  ```sql
  CREATE INDEX idx_employee_salary_desc ON Employee(salary DESC);
  ```
- With this index in place, the database engine navigates directly to the top nodes of the B-tree index. Finding the 1st and 2nd distinct salaries executes in $O(1)$ index lookups without touching the underlying table heap pages.

## 7. 🧠 The Memory Hook

To find the second highest salary, either **filter out the top** with `salary < (SELECT MAX)` or **tier the values** with `DENSE_RANK()`. To keep backend APIs safe, always wrap the query in `MAX()` or an outer `SELECT` so missing ranks evaluate to `NULL` instead of an empty table.
