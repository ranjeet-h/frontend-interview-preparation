# Write a Query Using `DENSE_RANK()` in SQL: Ranking Without Gaps

## 1. What the Interviewer Is Really Testing

You have an employees table and the product manager asks for the top 3 salary tiers per department. Or the 2nd highest distinct salary across the company. You write `ORDER BY salary DESC LIMIT 3` and it looks right until someone points out two people share the top salary. Now you are returning three rows but only two distinct pay levels. Or you tried `RANK()` and a tie left a gap that made the 3rd tier disappear.

That is the pain this question lives in. Real ranking is not just sorting. When salaries tie, you have to decide what the next number should be. Interviewers ask about `DENSE_RANK()` because they want to see if you actually know how the three ranking functions behave when values are equal.

`ROW_NUMBER() OVER (ORDER BY salary DESC)` gives every row its own number, 1, 2, 3, 4, breaking ties arbitrarily. `RANK() OVER (ORDER BY salary DESC)` gives ties the same number but then skips, 1, 1, 3, because it counts how many rows came before. `DENSE_RANK() OVER (ORDER BY salary DESC)` gives ties the same number and never skips, 1, 1, 2, so the sequence stays dense with no gaps after ties. If the question says top N distinct salaries, tiers, or levels, they mean `DENSE_RANK()`. They also want to hear that you cannot filter a window function directly in `WHERE` because windows run after `WHERE` in the execution order, so you wrap it in a CTE or subquery and filter outside.

## 2. Think Before You Code — The Senior Dev Thought Process

The prompt I get most often is this: given an `employees` table with `id`, `name`, `department`, `salary`, find the employees who sit in the top 3 distinct salaries in each department, or find the nth highest distinct salary overall.

The first thing I notice is the phrase distinct salaries. If two engineers both earn 5000, they are both rank 1. The next lower salary is rank 2, not rank 3. That one word tells me this is a dense ranking problem.

My instinct is to consider the brute force way without windows. I could write a correlated subquery that counts how many distinct salaries in the same department are higher than the current row: `WHERE (SELECT COUNT(DISTINCT salary) FROM employees e2 WHERE e2.department = e1.department AND e2.salary > e1.salary) < 3`. That works logically but it scans the table for every row. On a table with hundreds of thousands of rows that is roughly O(N squared) work. It will be slow and hard to read.

Then I think about the window options. If I use `ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC) <= 3`, I get exactly three rows per department no matter how ties fall. If three people tie at 5000, `ROW_NUMBER()` picks one of them for rank 1, one for 2, one for 3, and the person at 4000 who should be in the top 2 distinct tiers gets dropped. That violates the requirement.

If I use `RANK() OVER (PARTITION BY department ORDER BY salary DESC) <= 3`, ties share a rank but the next rank skips by the size of the tie. With salaries [5000, 5000, 4000], `RANK()` gives 1, 1, 3. That still passes `<=3`, but with [5000, 5000, 5000, 4000, 4000, 3000], `RANK()` gives 1, 1, 1, 4, 4, 6. Now rank 2 and 3 never exist, so `RANK() <=3` returns only the three people at 5000 and misses the people at 4000 who are actually the second distinct tier. That is the trap interviewers wait for.

So the pattern clicks: top N distinct values per group means `DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC)` and filter `rnk <= N`. For a global ranking like nth highest salary, drop the partition: `DENSE_RANK() OVER (ORDER BY salary DESC)`. And because windows are computed in the SELECT phase, I will compute the rank inside a CTE named `ranked` and filter on it in the outer query. That plan also tells me what index helps: `(department, salary DESC)`.

## 3. The Solution — Fully Explained Code

First, the core difference side by side. Take a single department with three rows:

| name | salary | ROW_NUMBER() | RANK() | DENSE_RANK() | notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Asha | 5000 | 1 | 1 | 1 | tie, first distinct tier |
| Ben | 5000 | 2 | 1 | 1 | tie keeps same dense rank |
| Cara | 4000 | 3 | 3 | 2 | `RANK()` skips to 3, `DENSE_RANK()` goes to 2 with no gap |

Whenever you see no gaps after ties, that is dense.

Here is runnable SQL you can paste into SQLite, PostgreSQL, or MySQL 8+. It creates the table, inserts data, and runs the dense rank correctly:

```sql
-- runnable in sqlite3, postgres, mysql 8+
CREATE TABLE employees (
  id INTEGER PRIMARY KEY,
  name TEXT,
  department TEXT,
  salary INTEGER
);

INSERT INTO employees (id, name, department, salary) VALUES
  (1, 'Asha', 'Eng', 5000),
  (2, 'Ben', 'Eng', 5000),
  (3, 'Cara', 'Eng', 4000),
  (4, 'Dan', 'Eng', 3000),
  (5, 'Eli', 'Sales', 6000),
  (6, 'Fay', 'Sales', 6000),
  (7, 'Gus', 'Sales', 4000),
  (8, 'Hana', 'Sales', 3000);

-- global dense rank: rank across all employees
SELECT
  name,
  salary,
  DENSE_RANK() OVER (ORDER BY salary DESC) AS dense_rank,
  RANK() OVER (ORDER BY salary DESC) AS rnk,
  ROW_NUMBER() OVER (ORDER BY salary DESC) AS row_num
FROM employees
ORDER BY salary DESC, name;

-- top 3 distinct salaries per department
WITH ranked AS (
  SELECT
    id,
    name,
    department,
    salary,
    DENSE_RANK() OVER (
      PARTITION BY department
      ORDER BY salary DESC
    ) AS rnk
  FROM employees
)
SELECT department, rnk, salary, name
FROM ranked
WHERE rnk <= 3
ORDER BY department ASC, rnk ASC, name ASC;
```

A few decisions to call out in plain language. `DENSE_RANK() OVER (ORDER BY salary DESC)` says give the highest salary rank 1, ties get the same rank, next distinct salary gets rank 2 with no gap. Adding `PARTITION BY department` says restart the counting at 1 for each department, so Eng and Sales have independent leaderboards. `WITH ranked AS (...)` is the CTE that materializes the window column so the outer `WHERE rnk <= 3` can filter it, because you cannot put a window function directly in `WHERE`. The final `ORDER BY department, rnk, name` makes output deterministic for tests and UI.

Time complexity is dominated by sorting. Without a helpful index it is O(N log N) where N is the number of rows. Space is O(N) for the sort buffer and CTE materialization, spilling to disk if the partition is huge. If you have `CREATE INDEX idx_emp_dept_salary ON employees(department, salary DESC, name)`, the engine can read rows already partitioned and sorted and often avoids an explicit sort.

## 4. Dry Run — Walk Through a Real Example

Take the smallest case that shows the difference: salaries [5000, 5000, 4000] in one department. Three rows, two distinct pay tiers.

Input rows unsorted:

| id | name | salary |
| :--- | :--- | :--- |
| 1 | Asha | 5000 |
| 2 | Ben | 5000 |
| 3 | Cara | 4000 |

Step 1 is partition and sort. With no `PARTITION BY` or with a single department partition, the engine sorts descending: 5000, 5000, 4000. Order between tied 5000 rows follows the secondary key if you add one, otherwise it is nondeterministic.

Step 2 is walk the sorted list and assign ranks by comparing each salary to the previous distinct salary.

Start with Asha at 5000. There is no previous salary, so both `RANK()` and `DENSE_RANK()` give 1, and `ROW_NUMBER()` gives 1.

Move to Ben at 5000. It matches the previous salary, so `DENSE_RANK()` stays at 1 and `RANK()` stays at 1. `ROW_NUMBER()` must keep counting, so it goes to 2.

Move to Cara at 4000. It is a new distinct salary. `DENSE_RANK()` always adds one to the previous dense rank, so it goes from 1 to 2. `RANK()` adds the count of rows seen before, so it goes from 1 plus 2 rows before equals 3. `ROW_NUMBER()` goes to 3.

Result for [5000, 5000, 4000]:

| name | salary | DENSE_RANK() | RANK() | ROW_NUMBER() |
| :--- | :--- | :--- | :--- | :--- |
| Asha | 5000 | 1 | 1 | 1 |
| Ben | 5000 | 1 | 1 | 2 |
| Cara | 4000 | 2 | 3 | 3 |

That one line is the whole interview test. `DENSE_RANK()` is 1, 1, 2 with no gap. `RANK()` is 1, 1, 3 with a gap. `ROW_NUMBER()` is 1, 2, 3 with no ties at all.

Now filter `WHERE dense_rank <= 2`. Both Asha and Ben at rank 1 and Cara at rank 2 pass, so you get all three rows but only two distinct tiers, which is correct for top 2 distinct salaries. If you had filtered `WHERE rnk <=2` using `RANK()`, Cara at rank 3 would be incorrectly excluded.

If we run the per-department query on the larger sample from the previous section, the same logic repeats per partition. Eng partition sorts to 5000, 5000, 4000, 3000 and gets dense ranks 1, 1, 2, 3. Sales partition sorts to 6000, 6000, 4000, 3000 and also gets 1, 1, 2, 3. The counter resets when the department changes. Filtering `rnk <=3` keeps everyone in this small sample, but if we inserted another Eng row at 2000, that row would get dense rank 4 and be removed.

## 5. Edge Cases — The Ones That Break Naive Solutions

Ties that cover the whole partition cause an unbounded result. If twenty people in Eng all earn 5000, they all get dense rank 1. `WHERE rnk <=3` then returns twenty rows, not three. That is correct for distinct tiers but it can blow up a UI that expected at most three cards. When the interviewer asks what breaks at scale, say you would discuss whether ties should expand the result or whether you need a secondary cap with `ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC, id)` and add `AND row_num <= 10` alongside the dense rank filter.

NULL salaries are the dialect surprise. In PostgreSQL, `ORDER BY salary DESC` puts NULL first, so a row with `salary IS NULL` gets `DENSE_RANK()` 1 unless you say otherwise. In MySQL and SQLite, NULL is smallest, so `ORDER BY salary DESC` puts NULL last, which feels safer. The fix is to be explicit. Either filter them out before ranking with `WHERE salary IS NOT NULL` in the CTE, or control placement: `DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC NULLS LAST)`. If you forget this, a department where everyone has NULL salary will report NULL as the top tier.

Partitions that are too small are fine but worth stating. If a department has only one distinct salary, say all salaries are 5000, the partition only produces rank 1. `rnk <=3` returns every row and does not error. That graceful handling is one reason teams pick dense rank instead of hand-rolled rank math.

Missing indexes show up fast in production. `DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC)` on an unindexed table forces a full scan plus a sort. You will see `Sort` and `WindowAgg` in Postgres or `Using filesort` in MySQL. Adding `CREATE INDEX idx_emp_dept_salary ON employees(department, salary DESC)` lets the planner read the B-Tree already grouped and sorted and often removes the sort step.

## 6. Variations and Follow-ups

Interviewers rarely stop at top 3 per group. They push into variations.

Finding the nth highest distinct salary globally is the classic. Drop the partition and rank over the whole table, then filter for that rank. For second highest:

```sql
WITH ranked AS (
  SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS rnk
  FROM employees
  WHERE salary IS NOT NULL
)
SELECT DISTINCT salary
FROM ranked
WHERE rnk = 2;
```

That returns 5000 if salaries are 6000, 5000, 5000, 4000. Using `rnk = 2` after `DENSE_RANK()` is the key, because `rnk` counts distinct tiers. If you wanted the nth highest salary including duplicates with row counting, you would switch to `ROW_NUMBER()`, but the interview almost always means distinct.

Top N per group is the general form of the earlier query. Change `rnk <= 3` to any N, or flip direction for bottom N: `DENSE_RANK() OVER (PARTITION BY department ORDER BY salary ASC)` gives the lowest distinct tiers first. Product teams often ask for top 2 earners per department for a dashboard, so you would set `rnk <= 2`.

When they add a row limit on top of dense rank, combine both windows in one CTE:

```sql
WITH ranked AS (
  SELECT
    name, department, salary,
    DENSE_RANK() OVER (PARTITION BY department ORDER BY salary DESC) AS rnk,
    ROW_NUMBER() OVER (PARTITION BY department ORDER BY salary DESC, id) AS row_num
  FROM employees
)
SELECT department, rnk, salary, name
FROM ranked
WHERE rnk <= 2 AND row_num <= 5
ORDER BY department, rnk, name;
```

That keeps the top 2 distinct tiers but never more than five people per department, which protects the frontend.

If the interviewer asks how you did this before window functions, mention the old correlated subquery counting distinct higher salaries or a self-join with `GROUP BY` and `HAVING COUNT(DISTINCT ...)`. It worked but was O(N squared) and unreadable. The window version is why MySQL 8 and modern Postgres made ranking a single pass.

## 7. 🧠 The Memory Hook

`ROW_NUMBER()` counts rows, 1, 2, 3, 4. `RANK()` counts rows but ties skip, 1, 1, 3. `DENSE_RANK()` counts distinct values, 1, 1, 2, no gaps. If the question says distinct salaries, tiers, or levels, you want `DENSE_RANK() OVER (ORDER BY salary DESC)` wrapped in a CTE and filtered outside. Partition adds per group, `PARTITION BY department` just restarts the counting at 1 for each group.
