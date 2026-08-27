# Write a Query to Get the Nth Highest Salary in SQL

## 1. What the Interviewer Is Really Testing

Finding the maximum value in a table is trivial with `MAX(salary)`. Finding the second highest salary can be easily solved with a quick subquery like `WHERE salary < (SELECT MAX(salary))`. 

Finding the **$N$-th highest salary** is where interviewers test whether you can generalize a data retrieval problem to arbitrary parameters while avoiding production pitfalls. Specifically, they are testing:

- **Handling Duplicate Values (Ties):** If two employees earn \$100k, what is the second highest salary? A junior developer often skips duplicate rows without realizing that rank #2 must be \$90k, not the second \$100k.
- **Window Function Mechanics:** Understanding the critical differences between `DENSE_RANK()`, `RANK()`, and `ROW_NUMBER()` in ANSI SQL.
- **Return Type Contracts (`NULL` vs Empty Set):** In SQL, a query that finds no matching rows returns an *empty result set* (zero rows). Many API contracts and stored procedures require returning a single row containing `NULL`. The interviewer evaluates whether you know how to coerce an empty set into a scalar `NULL`.
- **Dynamic Parameterization:** Handling dynamic inputs ($N$) inside stored functions or parameterized queries, including SQL dialect restrictions around arithmetic in `LIMIT` and `OFFSET` clauses.

---

## 2. Think Before You Code — The Senior Dev Thought Process

When approaching this problem, an experienced developer walks through the problem requirements and identifies edge cases before writing a single keyword.

**The Naive Trap: `LIMIT 1 OFFSET N-1`**

The most common first instinct is sorting salaries in descending order and using pagination:

```sql
SELECT salary 
FROM Employee 
ORDER BY salary DESC 
LIMIT 1 OFFSET N - 1;
```

This naive query fails in three major ways:
1. **Duplicates break the rank count:** If the salary values are `[100, 100, 90, 80]` and $N = 2$, `OFFSET 1` lands on the second `100`. The true second highest distinct salary is `90`.
2. **Missing rows return nothing instead of NULL:** If the table only has 2 distinct salaries and $N = 4$, `OFFSET 3` returns an empty set (`0 rows returned`). If the specification requires a scalar `NULL`, this fails the contract.
3. **Dynamic arithmetic inside `OFFSET`:** In MySQL and many SQL dialects, `OFFSET` cannot accept arbitrary expressions like `N - 1` directly inside the query without declaring a variable first.

**Designing the Right Approaches**

To solve this properly across different database environments, there are three main architectural strategies:

1. **The ANSI SQL Gold Standard (`DENSE_RANK()`):** Window functions assign ranks based on ordered data. `DENSE_RANK()` assigns consecutive integers without gaps when ties occur (`1, 1, 2, 3...`). Filtering by `ranking = N` directly targets the $N$-th distinct salary. Wrapping this in an outer scalar query guarantees that a missing rank outputs `NULL`.
2. **The MySQL Stored Function Pattern (`DISTINCT` + `LIMIT 1 OFFSET M`):** By pre-calculating `SET M = N - 1` and selecting `DISTINCT salary`, pagination works correctly because duplicate salaries are collapsed before offset skipping occurs.
3. **The Correlated Subquery (Universal Fallback):** For older database engines without window function support, we can use a pure relational concept: the $N$-th highest salary is the salary that has exactly $N - 1$ distinct salaries strictly greater than itself.

---

## 3. The Solution — Fully Explained Code

**Approach A: ANSI SQL Standard with `DENSE_RANK()` and CTE (Recommended)**

This is the cleanest, most portable solution for modern database engines (PostgreSQL, MySQL 8.0+, SQL Server, Oracle, and SQLite 3.25+).

```sql
-- Common Table Expression (CTE) computes the dense rank of every distinct salary
WITH RankedSalaries AS (
    SELECT 
        salary,
        DENSE_RANK() OVER (ORDER BY salary DESC) AS ranking
    FROM Employee
)
-- A scalar subquery returns NULL if no row satisfies ranking = N
SELECT (
    SELECT DISTINCT salary 
    FROM RankedSalaries 
    WHERE ranking = N
) AS getNthHighestSalary;
```

**How it works:**
- `DENSE_RANK() OVER (ORDER BY salary DESC)` assigns rank 1 to the highest salary. If multiple employees have the highest salary, they all receive rank 1. The next lower salary receives rank 2 (no numbers skipped).
- `SELECT DISTINCT salary ... WHERE ranking = N` finds the salary associated with rank $N$.
- Wrapping the lookup inside an outer `SELECT (...) AS getNthHighestSalary` converts an empty result set into a scalar `NULL` value if rank $N$ does not exist.

**Complexity:**
- **Time Complexity:** $O(R \log R)$, where $R$ is the number of rows in `Employee`. Sorting the rows to evaluate the window function dominates execution time. With a B-Tree index on `(salary DESC)`, the database can scan ordered index leaf pages in $O(N)$ time.
- **Space Complexity:** $O(R)$ temporary memory used to materialize the ranking window buffer before filtering.

---

**Approach B: MySQL Stored Function with `LIMIT` and `OFFSET`**

In MySQL, stored functions provide a reusable routine to fetch the $N$-th highest salary dynamically.

```sql
CREATE FUNCTION getNthHighestSalary(N INT) RETURNS INT
BEGIN
  -- Declare an offset variable because OFFSET does not evaluate expressions inline in stored routines
  DECLARE M INT;
  SET M = N - 1;

  RETURN (
      -- DISTINCT collapses duplicates before OFFSET skips the top M distinct values
      SELECT DISTINCT salary
      FROM Employee
      ORDER BY salary DESC
      LIMIT 1 OFFSET M
  );
END;
```

**How it works:**
- `SET M = N - 1;` computes the zero-based offset. The highest salary ($N = 1$) corresponds to offset 0, the second highest ($N = 2$) to offset 1, and so on.
- `SELECT DISTINCT salary` eliminates duplicates first. If salaries are `[100, 100, 90]`, the distinct set is `[100, 90]`.
- `ORDER BY salary DESC LIMIT 1 OFFSET M` sorts distinct values and skips the top $M$ entries, returning the single value at index $M$.
- Wrapping the `SELECT` query inside the `RETURN (...)` expression automatically returns `NULL` if the offset exceeds the number of distinct salaries.

**Complexity:**
- **Time Complexity:** $O(R \log R)$ to sort and deduplicate without an index. With an index on `salary`, MySQL performs an index skip scan / index-ordered read in $O(N)$ time.
- **Space Complexity:** $O(U)$ where $U$ is the number of unique salaries stored in the temporary deduplication buffer.

---

**Approach C: Correlated Subquery (Engine-Agnostic / No Window Functions)**

This approach works on any relational database regardless of version or window function support.

```sql
SELECT DISTINCT e1.salary
FROM Employee e1
WHERE N - 1 = (
    -- Count how many distinct salaries in the table are strictly greater than e1.salary
    SELECT COUNT(DISTINCT e2.salary)
    FROM Employee e2
    WHERE e2.salary > e1.salary
);
```

**How it works:**
- For each candidate row `e1`, the inner subquery scans `Employee e2` and counts how many distinct salaries are strictly higher than `e1.salary`.
- For the highest salary ($N = 1$), exactly 0 distinct salaries are greater ($N - 1 = 0$).
- For the 2nd highest salary ($N = 2$), exactly 1 distinct salary is greater ($N - 1 = 1$).
- For the $N$-th highest salary, exactly $N - 1$ distinct salaries are greater.
- `DISTINCT` on `e1.salary` ensures that if multiple employees share the $N$-th highest salary, only one copy is returned.

**Complexity:**
- **Time Complexity:** $O(R^2)$ without an index because for every row in the outer table, the inner subquery scans the entire table. With an index on `salary`, the inner count takes $O(\log R)$ per row, yielding $O(R \log R)$ overall.
- **Space Complexity:** $O(1)$ auxiliary space beyond query execution state.

---

## 4. Dry Run — Walk Through a Real Example

Take the exact case the interviewer loves to test: salaries `[5000, 4000, 4000, 3000]` with `N = 2`. The answer must be `4000` — the second distinct salary, not the second row.

**Sample Data (`Employee` Table):**

| id | name | salary |
| :--- | :--- | :--- |
| 1 | Alice | 5000 |
| 2 | Bob | 4000 |
| 3 | Charlie | 4000 |
| 4 | David | 3000 |

Distinct salaries in descending order: `[5000, 4000, 3000]`

**Trace 1: `DENSE_RANK()` path — `N = 2` => `4000`**

`DENSE_RANK() OVER (ORDER BY salary DESC)` assigns ranks without gaps:

| id | salary | `ROW_NUMBER()` | `RANK()` | `DENSE_RANK()` |
| :--- | :--- | :--- | :--- | :--- |
| 1 | 5000 | 1 | 1 | **1** |
| 2 | 4000 | 2 | 2 | **2** |
| 3 | 4000 | 3 | 2 | **2** |
| 4 | 3000 | 4 | 4 | **3** |

Step by step: the window is sorted descending, so 5000 gets rank 1. Both 4000 rows tie, so both get rank 2 — dense means the next distinct value 3000 gets rank 3, not 4. Filtering `WHERE ranking = 2` returns the two rows with salary 4000, then `SELECT DISTINCT salary` collapses them to a single `4000`. If we had used `ROW_NUMBER()` instead, the second 4000 would have gotten row number 3 and a naive `WHERE row_number = 2` would return only one of the tied rows but still look correct here; where it truly breaks is with `[5000, 5000, 4000]` where `ROW_NUMBER` gives the duplicate 5000 rank 2 and returns 5000 again instead of 4000. `RANK()` gives `1, 2, 2, 4` for our data (skipping 3), so `WHERE rank = 2` also returns 4000 here but `WHERE rank = 3` would miss entirely.

Result: `4000`.

**Trace 2: `DISTINCT + LIMIT/OFFSET` path — same input**

Distinct set after `SELECT DISTINCT salary` is `[5000, 4000, 3000]` sorted descending. With `N = 2`, `M = N - 1 = 1`, so `LIMIT 1 OFFSET 1` skips 5000 and returns 4000. Without `DISTINCT`, the raw ordered list is `[5000, 4000, 4000, 3000]` and `OFFSET 1` lands on the second 4000 — coincidentally still 4000 here, but with `[5000, 5000, 4000]` it would land on the second 5000 and return the wrong answer.

Result: `4000`.

**Trace 3: Correlated subquery path — counting distinct greater values**

We evaluate `WHERE N - 1 = (SELECT COUNT(DISTINCT e2.salary) WHERE e2.salary > e1.salary)` with `N - 1 = 1`:

- For `salary = 5000`: distinct greater salaries = `{}`. Count = `0`. `1 = 0` is FALSE.
- For `salary = 4000`: distinct greater salaries = `{5000}`. Count = `1`. `1 = 1` is TRUE — both 4000 rows match, then `DISTINCT e1.salary` collapses them to one `4000`.
- For `salary = 3000`: distinct greater salaries = `{5000, 4000}`. Count = `2`. `1 = 2` is FALSE.

Result: `4000`.

**Trace 4: Out of bounds — `N = 5` on the same data**

There are only 3 distinct salaries, so rank 5 does not exist. In Approach A, no row satisfies `ranking = 5`, the inner `SELECT DISTINCT salary ... WHERE ranking = 5` produces zero rows, and the outer scalar wrapper `SELECT (SELECT ...) AS getNthHighestSalary` converts that empty set into a single `NULL` row. In Approach B, `M = 4`, so `LIMIT 1 OFFSET 4` on a 3-element distinct list returns no row and `RETURN(...)` yields `NULL`.

Result: `NULL`.

---

## 5. Edge Cases — The Ones That Break Naive Solutions

**1. Duplicate Salaries (Ties at Multiple Ranks)**
- *The Trap:* Using `ROW_NUMBER()` or `OFFSET` without `DISTINCT`. If top salaries are `[500, 500, 400]`, `ROW_NUMBER()` assigns ranks 1, 2, 3. The 2nd rank incorrectly points to the duplicate `500`.
- *The Fix:* Always use `DENSE_RANK()` or `DISTINCT` before applying pagination.

**2. $N$ Exceeds Total Distinct Salaries ($N > \text{Count}$)**
- *The Trap:* Running a standalone `SELECT DISTINCT salary FROM Employee ORDER BY salary DESC LIMIT 1 OFFSET N-1`. When $N$ is too large, the database returns an empty result set (0 rows), which crashes downstream applications expecting a single row result `{ "getNthHighestSalary": null }`.
- *The Fix:* Wrap the statement in a scalar subquery `SELECT (SELECT ...) AS getNthHighestSalary` or use an explicit `IFNULL` / `COALESCE` construct.

**3. Non-Positive Rank ($N \le 0$)**
- *The Trap:* If a client passes $N = 0$ or $N = -1$, `SET M = N - 1` calculates a negative offset (`M = -1`), throwing a SQL syntax or runtime error in MySQL (`OFFSET must be >= 0`).
- *The Fix:* In stored functions, validate the parameter upfront:
  ```sql
  IF N <= 0 THEN
      RETURN NULL;
  END IF;
  ```

**4. Table is Empty (0 Rows)**
- *The Trap:* Aggregations or joins failing on empty tables.
- *The Fix:* `DENSE_RANK()` on an empty table produces an empty CTE. The outer scalar select safely evaluates to `NULL`.

**5. All Employees Have the Same Salary**
- *The Trap:* If all employees earn \$100k, any request for $N \ge 2$ must return `NULL`.
- *The Fix:* `DENSE_RANK()` assigns rank 1 to all rows. Filtering for $N = 2$ returns no rows, resolving cleanly to `NULL`.

**6. Table Contains `NULL` Salaries**
- *The Trap:* In SQL, `NULL` values sort differently depending on the dialect. In PostgreSQL, `NULL` sorts highest by default in `DESC` ordering (`NULLS FIRST`), which would assign rank 1 to `NULL`.
- *The Fix:* Filter out `NULL` values or explicitly specify `ORDER BY salary DESC NULLS LAST`:
  ```sql
  WHERE salary IS NOT NULL
  ```

---

## 6. Variations and Follow-ups

**Variation 1: Find the Nth Highest Salary per Department**

In real-world applications, you often need the $N$-th highest salary within each distinct category (e.g., department, region, team).

```sql
WITH DepartmentRankedSalaries AS (
    SELECT 
        d.name AS department_name,
        e.salary,
        DENSE_RANK() OVER (
            PARTITION BY e.department_id 
            ORDER BY e.salary DESC
        ) AS ranking
    FROM Employee e
    JOIN Department d ON e.department_id = d.id
)
SELECT DISTINCT 
    department_name,
    salary
FROM DepartmentRankedSalaries
WHERE ranking = N;
```

**Key Difference:** Adding `PARTITION BY e.department_id` resets the dense rank back to 1 for each department.

---

**Variation 2: Top $N$ Unique Salaries (Range Instead of Single Value)**

Instead of returning only the single $N$-th salary, retrieve all top $N$ distinct salaries:

```sql
WITH RankedSalaries AS (
    SELECT 
        salary,
        DENSE_RANK() OVER (ORDER BY salary DESC) AS ranking
    FROM Employee
)
SELECT DISTINCT salary, ranking
FROM RankedSalaries
WHERE ranking <= N
ORDER BY ranking ASC;
```

---

**Variation 3: Production Scale Optimization ($10^7+$ Rows)**

When querying a massive table with millions of rows, running `DENSE_RANK()` forces the database engine to sort the entire dataset, which spills to disk (TempDB / filesort).

**Optimization Strategy:**
1. **Index Support:** Create a descending B-Tree index on the salary column:
   ```sql
   CREATE INDEX idx_employee_salary ON Employee(salary DESC);
   ```
2. **Composite Index for Partitioned Queries:**
   ```sql
   CREATE INDEX idx_emp_dept_salary ON Employee(department_id, salary DESC);
   ```
With this composite index, the database can satisfy the `PARTITION BY department_id ORDER BY salary DESC` window function using an index scan without an explicit sorting pass.

---

## 7. 🧠 The Memory Hook

To recall the solution instantly in an interview, keep these three rules in mind:

1. **"Dense means no dents"**: `DENSE_RANK()` leaves no gaps in ranks when there are ties (`1, 1, 2, 3`). Always pick `DENSE_RANK()` for competitive salary rankings.
2. **"The Count Invariant"**: The $N$-th largest value has **exactly $N - 1$ distinct values strictly above it**.
3. **"Wrap to return NULL"**: A query with no matching rows returns *nothing* (empty set). Wrapping a query in `SELECT (SELECT ...)` turns an empty set into a single scalar `NULL`.

