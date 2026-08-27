# Write a Query Using `RIGHT JOIN` in SQL: Mirror Mechanics and Why Left Join Is Preferred

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using `RIGHT JOIN`, they are rarely checking whether you can type the keyword `RIGHT`. They are probing three deeper things.

First, do you understand directional preservation. An outer join picks one table as the anchor whose rows must survive 100% in the result, even when the other side has no match. In a `RIGHT JOIN`, the right table is that anchor. Every row from the right appears, and missing left columns show up as `NULL`.

Second, do you know that `RIGHT JOIN` is just `LEFT JOIN` in a mirror. Every `RIGHT JOIN` can be rewritten by swapping table order:

`TableA RIGHT JOIN TableB` is exactly the same as `TableB LEFT JOIN TableA`

Same rows, same cardinality, same plan cost. The join condition `A.fk = B.pk` is symmetric, only the anchor side flips.

Third, do you know production style. Most teams ban `RIGHT JOIN` in style guides. English reads left to right. Queries read top to bottom. When you chain five joins and one of them is a `RIGHT JOIN` in the middle, you suddenly flip the anchor and make everyone read backwards. It is easy to misread which rows are preserved and to introduce subtle precedence bugs. A strong candidate writes the requested `RIGHT JOIN` without hesitation, explains exactly what it preserves, and then volunteers the idiomatic `LEFT JOIN` refactor and why teams prefer it.

## 2. Think Before You Code — The Senior Dev Thought Process

The prompt we will use:

> We need a department staffing audit. Return every department alongside the names of employees assigned to it. If a department has zero staff — say a newly approved Legal or Marketing unit — it must still appear with a `NULL` employee name.

My first thought as a senior dev is: what is the primary entity? The requirement says **every department**. That makes `Departments` the anchor. `Employees` is optional.

If I wrote a plain `INNER JOIN`:

```sql
SELECT e.name AS employee_name, d.name AS department_name
FROM Employees e
INNER JOIN Departments d ON e.department_id = d.id;
```

This fails immediately. Any department with zero employees vanishes because `e.department_id = d.id` has nothing to match. `INNER JOIN` keeps only the intersection.

So I need an outer join that preserves `Departments`. The obvious production way is `FROM Departments LEFT JOIN Employees`. But if the interview explicitly says start with `FROM Employees` (left table) and join `Departments` (right table), the only way to preserve departments while keeping that order is `RIGHT JOIN Departments`.

My next thought is readability. `FROM Employees RIGHT JOIN Departments` forces me to read backwards: I start with employees but my driving set is departments. In a three-table chain, mixing `LEFT` and `RIGHT` is a maintenance trap. So the plan is: show the direct `RIGHT JOIN` the question asks for, prove it works, then immediately show the clean left-anchored refactor that I would actually ship.

Brute force is not relevant here — there is no algorithmic search. The trade-off is clarity versus strict compliance with the prompt. Both queries produce identical output; the `LEFT JOIN` version just reads the way humans think.

## 3. The Solution — Fully Explained Code

Schema for all examples:

```sql
-- Departments is the parent, Employees has the foreign key
CREATE TABLE Departments (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE Employees (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  department_id INTEGER REFERENCES Departments(id),
  is_active     INTEGER DEFAULT 1,
  salary        INTEGER DEFAULT 50000
);
```

This is runnable in SQLite 3.39+, PostgreSQL, and MySQL 8. The syntax is identical across them. SQLite gained `RIGHT JOIN` support in 2022 — older embeds may not have it, which is another reason teams avoid it.

Solution 1 — the direct `RIGHT JOIN` the interview asks for. Keep `Employees` on the left, preserve all `Departments` on the right:

```sql
-- Solution 1: RIGHT JOIN — preserve every row from the right table
-- All departments appear; unmatched employee columns become NULL
SELECT
    e.name AS employee_name,
    d.name AS department_name
FROM Employees e
RIGHT JOIN Departments d
    ON e.department_id = d.id;
```

Why this works line by line: `RIGHT JOIN Departments` tells the planner that `Departments` is the preserved side. For each department it probes `Employees` on `e.department_id = d.id`. If one or more employees match, it emits one row per match with both names filled. If no employee matches, it still emits one row with `d.name` intact and `e.name` as `NULL`.

Solution 2 — the production refactor. Flip the order and use `LEFT JOIN` so the anchor is on the left where your eyes start:

```sql
-- Solution 2: Idiomatic LEFT JOIN refactor — identical result, preferred in code review
-- Anchor on the left so the query reads top-to-bottom in business order
SELECT
    d.name AS department_name,
    e.name AS employee_name
FROM Departments d
LEFT JOIN Employees e
    ON d.id = e.department_id;
```

These two are logically identical. Swapping sides and swapping `RIGHT` for `LEFT` does not change the row count or the index lookup.

Time complexity: `O(N + M)` when `Departments.id` (primary key) and `Employees.department_id` (indexed foreign key) exist, using a Hash Join or Indexed Nested Loop. Without indexes the planner falls back to Sort-Merge `O(N log N + M log M)` or Block Nested Loop `O(N * M)`.

Space complexity: `O(M)` for the hash table built from the smaller side in memory, plus `O(N + M)` streaming cost for the final projection. You are not buffering the whole result.

## 4. Dry Run — Walk Through a Real Example

Concrete data:

Departments:

| id | name |
| :--- | :--- |
| 1 | Engineering |
| 2 | Design |
| 3 | Marketing |
| 4 | Legal |

Employees:

| id | name | department_id |
| :--- | :--- | :--- |
| 101 | Alice | 1 |
| 102 | Bob | 1 |
| 103 | Charlie | 2 |
| 104 | David | NULL |

We run `FROM Employees e RIGHT JOIN Departments d ON e.department_id = d.id`.

Step 1 — Department 1, Engineering: probe `Employees` where `department_id = 1`. Finds Alice and Bob. Emits two rows: `('Alice', 'Engineering')` and `('Bob', 'Engineering')`.

Step 2 — Department 2, Design: probe `department_id = 2`. Finds Charlie. Emits `('Charlie', 'Design')`.

Step 3 — Department 3, Marketing: probe `department_id = 3`. Finds nothing. Because Marketing lives in the preserved right table, the row is not discarded. The engine pads the left columns with `NULL` and emits `(NULL, 'Marketing')`.

Step 4 — Department 4, Legal: same as Marketing. No match, but preserved. Emits `(NULL, 'Legal')`.

Step 5 — What about David? David is in `Employees` with `department_id = NULL`. `NULL = d.id` is never true in SQL three-valued logic, so David matches no department. Since this is a `RIGHT JOIN` preserving `Departments`, unmatched left-side rows are discarded. David disappears from the output. That is the key difference from `FULL OUTER JOIN` — right-only preservation drops orphan left rows.

Final result set, exactly what SQLite returns:

| employee_name | department_name |
| :--- | :--- |
| Alice | Engineering |
| Bob | Engineering |
| Charlie | Design |
| NULL | Marketing |
| NULL | Legal |

Run the same data with `FROM Departments d LEFT JOIN Employees e ON d.id = e.department_id` and you get the identical five rows, just with columns swapped. That is the mirror proof in practice.

## 5. Edge Cases — The Ones That Break Naive Solutions

The most common way to break an outer join is to filter the optional side in the `WHERE` clause and accidentally turn it back into an inner join.

```sql
-- BUGGY: silently drops Marketing and Legal again
SELECT e.name AS employee_name, d.name AS department_name
FROM Employees e
RIGHT JOIN Departments d ON e.department_id = d.id
WHERE e.is_active = 1;
```

For Marketing and Legal, `e.is_active` is `NULL`. `NULL = 1` evaluates to `UNKNOWN`, and `WHERE` keeps only `TRUE` rows. The fix is to move optional-side predicates into the `ON` clause so they are evaluated before the preservation:

```sql
-- CORRECT: filter is part of the join condition, empty departments still survive
SELECT e.name AS employee_name, d.name AS department_name
FROM Employees e
RIGHT JOIN Departments d
    ON e.department_id = d.id
    AND e.is_active = 1;
```

Second edge case is orphan rows on the unpreserved side. Contractors like David with `department_id IS NULL`, or employees pointing to a deleted department, are silently dropped by `RIGHT JOIN Departments`. If the product asks for both orphans and empty departments, `RIGHT JOIN` is the wrong tool. You need `FULL OUTER JOIN` there.

Third edge case is counting. After an outer join, `COUNT(*)` counts the padded `NULL` row and lies:

```sql
-- WRONG: Marketing reports 1 employee because the NULL row is counted
SELECT d.name, COUNT(*) AS total_staff
FROM Employees e
RIGHT JOIN Departments d ON e.department_id = d.id
GROUP BY d.id, d.name;

-- CORRECT: COUNT(e.id) ignores NULLs, empty departments report 0
SELECT d.name, COUNT(e.id) AS total_staff
FROM Employees e
RIGHT JOIN Departments d ON e.department_id = d.id
GROUP BY d.id, d.name;
```

The same trap exists for `SUM`. `SUM(e.salary)` over an empty department is `NULL`, not zero, so summaries need `COALESCE(SUM(e.salary), 0)`.

Fourth edge case is the `RIGHT` versus `LEFT` rewrite in a chain. Mixing directions in a three-table query collapses earlier preservation:

```sql
-- DANGEROUS: the final RIGHT JOIN re-anchors the whole intermediate result
FROM Companies c
LEFT JOIN Departments d ON c.id = d.company_id
RIGHT JOIN Employees e ON d.id = e.department_id;
```

`RIGHT JOIN Employees` preserves `Employees` over the entire `(Companies LEFT JOIN Departments)` intermediate set, so companies with no employees vanish even though the first join tried to keep them. The fix is simple and is why teams enforce it: pick one direction and stick to it. Start with the topmost parent and `LEFT JOIN` all the way down.

Fifth edge case is `NULL` in the join key itself. `e.department_id IS NULL` never equals `d.id`, even when `d.id` is also `NULL`. Outer joins pad with `NULL` but never match on `NULL`. If your data has nullable foreign keys, expect the `NULL` group to always produce padded rows.

## 6. Variations and Follow-ups

Interviewers rarely stop at "write a RIGHT JOIN." They push into these follow-ups.

Variation 1 — Find only empty departments, the classic anti-join.

"How do you return only departments with zero staff?"

You keep the outer join and filter for the left side being `NULL`:

```sql
-- Anti-join: keep departments where no employee survived the join
SELECT d.name AS empty_department
FROM Departments d
LEFT JOIN Employees e ON d.id = e.department_id
WHERE e.id IS NULL;
```

Using `e.id IS NULL` rather than `e.department_id IS NULL` is deliberate. `e.id` is the primary key and can never be `NULL` on a real employee row, so it cleanly distinguishes a padded row from a real row where the foreign key happens to be nullable.

Variation 2 — Full department summary with headcount and payroll.

"Show headcount and total salary per department, with zeros for empty ones."

```sql
SELECT
    d.name AS department_name,
    COUNT(e.id) AS total_employees,
    COALESCE(SUM(e.salary), 0) AS total_payroll
FROM Departments d
LEFT JOIN Employees e ON d.id = e.department_id
GROUP BY d.id, d.name
ORDER BY total_payroll DESC;
```

`COUNT(e.id)` and `COALESCE` are the two fixes from the edge cases section working together.

Variation 3 — Chaining hierarchies without losing parents.

"Show departments, their employees, and each employee's badges, without losing empty departments or badgeless employees."

```sql
SELECT
    d.name AS department_name,
    e.name AS employee_name,
    b.badge_title
FROM Departments d
LEFT JOIN Employees e ON d.id = e.department_id
LEFT JOIN EmployeeBadges b ON e.id = b.employee_id;
```

Consistent `LEFT JOIN` from parent to child is the pattern. Every level keeps its parent.

Variation 4 — RIGHT JOIN versus FULL OUTER JOIN. This is the interviewer's favorite trap to test whether you know what RIGHT does not do.

"When is RIGHT JOIN insufficient and FULL OUTER JOIN required?"

`RIGHT JOIN` preserves only the right side. `FULL OUTER JOIN` preserves both sides. Use `FULL` when the requirement says both orphans and empty parents must appear.

```sql
-- RIGHT JOIN: all departments, but David (NULL department_id) is lost
SELECT e.name AS employee_name, d.name AS department_name
FROM Employees e
RIGHT JOIN Departments d ON e.department_id = d.id;

-- FULL OUTER JOIN: all departments AND all employees including David
SELECT e.name AS employee_name, d.name AS department_name
FROM Employees e
FULL OUTER JOIN Departments d ON e.department_id = d.id;
```

Result difference on our data: the `RIGHT JOIN` returned five rows without David. The `FULL OUTER JOIN` returns six rows — the same five plus `(David, NULL)` for the orphan employee. MySQL does not support `FULL OUTER JOIN` natively, so there you emulate it with `LEFT JOIN UNION RIGHT JOIN` or `UNION ALL` with a `WHERE ... IS NULL` guard. Going back to style: even the `FULL` case is often written as a `LEFT` plus `UNION` to avoid mixing directions, but you must be able to write the direct `FULL OUTER JOIN` when the interviewer asks for it.

If the interviewer asks to rewrite `RIGHT JOIN` into `LEFT JOIN` for a style guide, the answer is one sentence plus the swapped query: move the preserved table to the `FROM` side and change `RIGHT` to `LEFT`. No change in plan or cardinality, just left-to-right readability.

## 7. 🧠 The Memory Hook

`A RIGHT JOIN B` is just `B LEFT JOIN A` driving in reverse. All right rows survive, left gaps become `NULL`. If your query reads backwards, swap the tables and put the anchor on the left — that is the version you ship.
