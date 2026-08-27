# Write a Query Using Common Table Expressions (CTE) in SQL

## 1. What the Interviewer Is Really Testing

You have seen the query that makes everyone scroll. Three levels of parentheses, a subquery inside a subquery, alias `t`, alias `t2`, alias `t3`, and you have to read it inside out to understand what it does. It works, but nobody wants to review it, nobody wants to debug it at 2am, and adding one more filter means counting brackets for ten minutes. That pain is why CTEs exist.

When an interviewer says "solve this using a CTE" they are not testing whether you know the word `WITH`. They are testing whether you choose readability without lying to yourself about performance. This looks like a syntax question, but it is really testing three judgments: do you reach for a named step instead of a nested subquery when the query has stages, do you know that a CTE is mostly a readability tool and in modern Postgres and MySQL it usually performs the same as the equivalent subquery, and do you know when that rule breaks.

Specifically they want to hear you say: a CTE lets you write `WITH cte_name AS ( ... ) SELECT ...` so the query reads top to bottom like a pipeline, you can chain several CTEs where the second one reads from the first, and the optimizer will normally inline a single-reference CTE just like a derived table — so you are not paying a speed penalty for clarity. They also want to hear you mention the exception: before Postgres 12 every CTE was a fence that forced the database to write the result to a buffer, and even now you can control that with `MATERIALIZED` or `NOT MATERIALIZED`, and they want to know you have at least seen `WITH RECURSIVE` for hierarchical data.

If you can explain that tradeoff in one breath — "I use a CTE for clarity, it costs me nothing in the normal case, I know when to force materialization, and I know how to make it recursive" — you have passed.

## 2. Think Before You Code — The Senior Dev Thought Process

The problem I keep seeing in interviews is this one: you have `Employees(id, name, department_id, salary)` and you need, per department, how many people earn strictly more than their department's average and what 10% of their combined salary would be as a bonus pool. Output is `department_id`, `eligible_count`, `total_bonus_budget`.

The first thing I notice is the dependency. I cannot know if Alice is eligible until I know her department's average. That average is not in any row, it is an aggregation over the whole department. My gut says `WHERE salary > AVG(salary)` but I catch myself — SQL runs `WHERE` before `GROUP BY`, so `AVG` does not even exist at that point. I need the average first, then the filter, then the final aggregation. That is three stages that depend on each other.

My brute force instinct is a correlated subquery:

`SELECT department_id, COUNT(*), SUM(salary * 0.10) FROM Employees e1 WHERE salary > (SELECT AVG(salary) FROM Employees e2 WHERE e2.department_id = e1.department_id) GROUP BY department_id`

I know why this is risky. Unless the optimizer rewrites it into a hash join, the engine can end up running that inner `SELECT AVG` once per row. With 100k employees that is 100k aggregate scans. It might get optimized away, but I do not want to rely on "might" in an interview.

The next idea is a derived table in the FROM: compute averages in a subquery and join to it. That works and it is fast, but now I have `SELECT ... FROM (SELECT ... FROM (SELECT ...))` and if tomorrow someone adds a filter for "only active departments" I am editing the middle layer and hoping I matched the right bracket. It reads inside out, which is exactly what breaks in code review.

So I look for the pattern. Whenever a question says "compute something per group, then filter individuals against it, then aggregate again" I know it is a pipeline question. The signal is the phrase "more than the average / top N per group / compare to group total." The tool for a pipeline is a CTE. I will do it in two named steps: first `DeptAverages` computes one row per department with `AVG(salary)`, second `AboveAvgEmployees` joins employees to that result and keeps only `salary > avg_salary`, and the final `SELECT` aggregates the survivors. It reads top to bottom, each step has a name, and if the optimizer is modern it inlines the whole thing so I paid nothing for the readability.

That is the thought process an interviewer is listening for: I saw the stage dependency, I named the bad options and why they hurt, I recognized the pipeline pattern, and I picked the CTE for clarity with eyes open about performance.

## 3. The Solution — Fully Explained Code

This is the full query. It runs as-is in Postgres, MySQL 8+, and SQLite. The shape is always `WITH name AS ( ... ), name2 AS ( ... ) SELECT ...`.

```sql
-- Stage 1: one row per department with its average salary
-- We group once so later steps can just join to this small result
WITH DeptAverages AS (
    SELECT
        department_id,
        AVG(salary) AS avg_salary
    FROM Employees
    GROUP BY department_id
),
-- Stage 2: keep only people who earn strictly more than their own department average
-- This CTE reads from both the base table and the previous CTE
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
-- Stage 3: final aggregation over the filtered stream
SELECT
    department_id,
    COUNT(*) AS eligible_count,
    SUM(salary * 0.10) AS total_bonus_budget
FROM AboveAvgEmployees
GROUP BY department_id
ORDER BY department_id;
```

Why this exact shape and not something else. `WITH ... AS (...)` gives the intermediate result a name so you can read it like a variable. Using two CTEs separated by a comma lets the second one reference the first, which is how you chain logic without nesting. The `INNER JOIN` in the second CTE is intentional: if you used a correlated subquery you would be hiding a join anyway, this just makes it explicit. The final `SELECT` does not need another join, it just aggregates what the pipeline already filtered.

Readability versus performance, honestly. In Postgres 12+ and MySQL 8.0.28+ a CTE that is referenced once is inlined by default — the planner treats it exactly like you had written a derived table in the FROM. You get clarity for free. The difference shows up when you reference the same CTE multiple times or when you write `AS MATERIALIZED`, which forces the engine to build the CTE into a temporary buffer. That can help if the CTE is expensive and reused, and it can hurt if it stops the optimizer from pushing a selective `WHERE` down into the scan. So the senior answer is "I default to CTE for readability, I know it is usually inlined, and I only force materialization when I have a reason."

Time complexity is O(N) with hash aggregation where N is the number of employee rows, because Stage 1 scans N rows to build D department averages, Stage 2 probes that D-sized hash table N times, and Stage 3 aggregates the K survivors where K is less than or equal to N.

Space complexity is O(D) for the materialized intermediate where D is the number of distinct departments, because `DeptAverages` holds only one row per department and `AboveAvgEmployees` can stream into the final aggregation without being fully buffered.

## 4. Dry Run — Walk Through a Real Example

Take this tiny `Employees` table. It is small enough to trace by hand but has every interesting case: a department where one person is above average, one where one person is above, and one with a single employee.

Sample data:

| id | name    | department_id | salary  |
|----|---------|---------------|---------|
| 1  | Alice   | 101           | 90000   |
| 2  | Bob     | 101           | 70000   |
| 3  | Charlie | 101           | 80000   |
| 4  | David   | 102           | 120000  |
| 5  | Emma    | 102           | 100000  |
| 6  | Frank   | 103           | 60000   |

First pass — `DeptAverages` groups and averages. The engine scans all six rows and builds a hash table keyed by `department_id`. For 101 it sees 90000, 70000, 80000 and computes (90000+70000+80000)/3 = 80000. For 102 it sees 120000, 100000 and computes 110000. For 103 it sees just 60000 and computes 60000. The virtual result of the first CTE is three rows: (101, 80000), (102, 110000), (103, 60000).

Second pass — `AboveAvgEmployees` joins and filters. For each employee it looks up that employee's department average and checks `salary > avg_salary`. Alice 90000 > 80000 is true, so she is kept. Bob 70000 > 80000 is false, dropped. Charlie 80000 > 80000 is false because it is strictly greater, not greater-or-equal, so dropped. David 120000 > 110000 is true, kept. Emma 100000 > 110000 is false, dropped. Frank 60000 > 60000 is false, so a single-person department produces zero survivors. After this stage only two rows remain: Alice (101, 90000, 80000) and David (102, 120000, 110000).

Final pass — outer `SELECT` groups the two survivors by `department_id`. Department 101 has one row, COUNT is 1 and SUM is 90000 * 0.10 = 9000. Department 102 has one row, COUNT is 1 and SUM is 120000 * 0.10 = 12000. Department 103 never appears because an `INNER JOIN` plus `GROUP BY` on the filtered stream produces no row when nobody qualifies. If the product required a zero row for empty departments you would left join from a `Departments` master table and wrap the sum in `COALESCE`.

Final output:

| department_id | eligible_count | total_bonus_budget |
|---------------|----------------|--------------------|
| 101           | 1              | 9000               |
| 102           | 1              | 12000              |

If you run this in SQLite to verify, the exact script is:

```sql
CREATE TABLE Employees(id INTEGER PRIMARY KEY, name TEXT, department_id INTEGER, salary NUMERIC);
INSERT INTO Employees VALUES (1,'Alice',101,90000),(2,'Bob',101,70000),(3,'Charlie',101,80000),(4,'David',102,120000),(5,'Emma',102,100000),(6,'Frank',103,60000);
WITH DeptAverages AS (
    SELECT department_id, AVG(salary) AS avg_salary FROM Employees GROUP BY department_id
),
AboveAvgEmployees AS (
    SELECT e.id, e.department_id, e.salary FROM Employees e JOIN DeptAverages d ON e.department_id = d.department_id WHERE e.salary > d.avg_salary
)
SELECT department_id, COUNT(*) AS eligible_count, SUM(salary * 0.10) AS total_bonus_budget FROM AboveAvgEmployees GROUP BY department_id ORDER BY department_id;
```

That returns the two rows above in every dialect that supports CTEs.

## 5. Edge Cases — The Ones That Break Naive Solutions

CTE name shadowing will surprise you once. If you write `WITH Employees AS (SELECT ...)` you now have a CTE called `Employees` that shadows the real table `Employees` for the rest of the query. Inside the main SELECT, `FROM Employees` means the CTE, not the base table. Postgres and SQLite both follow this rule: the CTE name wins in the same query scope. The fix is simple — never name a CTE the same as a table you still need to read. Call it `DeptAverages` or `Filtered` instead of reusing `Employees`.

Multiple CTEs look fiddly the first time. The syntax is `WITH a AS (...), b AS (...), c AS (...) SELECT ...` with commas between them and only one `WITH` keyword. A later CTE can read from any earlier CTE, but not the other way around. So `b` can do `FROM a` but `a` cannot see `b`. If you need two independent pipelines that do not depend on each other you can still define them both up front and join them in the final SELECT. Forgetting the comma or repeating `WITH` is the most common parse error.

Materialization in Postgres 12+ is the performance trap. Before Postgres 12 every CTE was an optimization fence — the engine had to write the whole CTE to a buffer before the outer query could run, which blocked predicate pushdown. Since Postgres 12 a CTE that is referenced once is inlined like a subquery, so `WHERE department_id = 101` in the outer query can be pushed down into the CTE scan. You can force the old behavior with `WITH DeptAverages AS MATERIALIZED (...)` which tells the planner to build it once and reuse it, useful when the CTE is expensive and referenced three times. You can force the new behavior with `AS NOT MATERIALIZED` to invite inlining and pushdown. If you do not write either hint the planner decides. In an interview say "single-reference CTEs are inlined by default in modern Postgres, I would only add MATERIALIZED when I am reusing an expensive CTE."

Single-employee and zero-variance departments produce empty results and people misread that as a bug. If a department has one employee, that employee's salary equals the average, and `salary > avg` is false, so the department disappears from the output. If everyone in a department earns exactly 100000, the average is 100000 and again nobody qualifies. If the business wants a zero row instead of no row, you must start from a `Departments` master table and `LEFT JOIN` the CTE, then `COALESCE(SUM(...), 0)`.

NULLs silently kill comparisons. `AVG` skips NULL salaries, but if every salary in a department is NULL then `AVG` returns NULL and `salary > NULL` evaluates to UNKNOWN, which WHERE treats as false — nobody qualifies and you get no error to warn you. Also `NULL = NULL` is never true, so employees with `department_id IS NULL` will not join to any average. Handle this with a `WHERE salary IS NOT NULL` guard or clean the data before the pipeline.

Money and rounding will bite you in the final SUM. If `salary` is `FLOAT` you can get 9000.000000002. Store money as `NUMERIC` or `DECIMAL` and wrap the result in `ROUND(SUM(salary * 0.10), 2)` so the bonus budget is exact to cents.

## 6. Variations and Follow-ups

The interviewer will not stop at the basic pipeline. Here is what they ask next and how the CTE shape changes.

Recursive hierarchy — "What if departments have parent departments and you need the whole subtree?" A normal CTE cannot loop, but `WITH RECURSIVE` can. You write an anchor that selects the roots and a recursive part that joins back to the CTE itself. This is the one place where a CTE does something a subquery cannot do cleanly.

```sql
-- Find all sub-departments under department 10, with depth
WITH RECURSIVE DeptTree AS (
    -- anchor: the starting department
    SELECT id, name, parent_id, 1 AS depth
    FROM Departments
    WHERE id = 10
    UNION ALL
    -- recursive step: find children of whatever we already found
    SELECT d.id, d.name, d.parent_id, dt.depth + 1
    FROM Departments d
    JOIN DeptTree dt ON d.parent_id = dt.id
)
SELECT * FROM DeptTree;
```

If someone asks why `UNION ALL` and not `UNION`, the answer is performance: `UNION` deduplicates which you do not need in a tree walk, and it can hide a cycle bug. In Postgres you also want to mention `CYCLE` or a depth guard to avoid infinite loops if the data has a bad parent link.

CTE for a window function — "Can you do this without a self-join?" Yes, you can compute the average with `AVG() OVER (PARTITION BY department_id)` but SQL does not let you put a window function in WHERE, so you still need a CTE to wrap it. The CTE becomes a nice way to name the windowed intermediate.

```sql
WITH EmployeesWithAvg AS (
    SELECT
        id,
        department_id,
        salary,
        AVG(salary) OVER (PARTITION BY department_id) AS dept_avg
    FROM Employees
)
SELECT
    department_id,
    COUNT(*) AS eligible_count,
    SUM(salary * 0.10) AS total_bonus_budget
FROM EmployeesWithAvg
WHERE salary > dept_avg
GROUP BY department_id;
```

The tradeoff is it scans `Employees` once and sorts or hashes by `department_id` for the window, versus the join version which scans and hashes once for the averages and once for the join. For a single filter the window version is often a little cheaper. If you need multiple different group aggregates, separate CTEs can be clearer.

Multi-reference and writable CTEs are the other two follow-ups. If you reference the same CTE in two branches of a `UNION ALL`, the planner may evaluate it twice unless you write `AS MATERIALIZED` to force one build. And in Postgres a CTE can contain `DELETE ... RETURNING` or `INSERT ... RETURNING`, which lets you archive and delete in one atomic statement without a separate transaction block — that is a writable CTE and it surprises people who think CTEs are read-only.

## 7. 🧠 The Memory Hook

A CTE is a labeled bin on an assembly line. `WITH bin_name AS (do one job)` puts a clean, named intermediate result on the bench so the next station can pick it up without digging through nested boxes. Write your query top to bottom, name each stage, and let the optimizer inline it for you — reach for `RECURSIVE` when the line has to loop back on itself.

