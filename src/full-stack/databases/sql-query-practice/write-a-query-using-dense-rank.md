# Write a Query Using `DENSE_RANK()` in SQL: Ranking Without Gaps

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using `DENSE_RANK()`, they are not just checking whether you know SQL syntax. They are testing whether you understand how relational database engines rank rows when ties occur, how window frames partition data across dimensions, and why traditional grouping operations fail on top-N-per-category problems.

Candidates who struggle with this problem often confuse three core window ranking functions:

- `ROW_NUMBER()` assigns a strict sequential integer ($1, 2, 3, 4$) to every row, breaking ties arbitrarily unless you provide explicit secondary sort columns.
- `RANK()` assigns the same rank to identical values, but skips subsequent rank numbers by the size of the tie ($1, 2, 2, 4$), leaving gaps in the ranking sequence.
- `DENSE_RANK()` assigns the same rank to identical values and always assigns the immediate next integer to the next distinct value ($1, 2, 2, 3$), preserving a contiguous sequence without gaps.

The interviewer also wants to see if you understand the SQL query evaluation lifecycle. Window functions execute in the `SELECT` phase, which happens after `FROM`, `WHERE`, `GROUP BY`, and `HAVING`. Because of this execution order, you cannot place a window function directly inside a `WHERE` filter. Demonstrating that you immediately reach for a Common Table Expression (CTE) or subquery proves you understand the database execution pipeline rather than guessing syntax.

## 2. Think Before You Code — The Senior Dev Thought Process

Here is the problem scenario: You are given an `ExamResults` table containing `student_id`, `classroom_id`, and `score`. Your task is to find the students who achieved the top 3 distinct exam scores within each classroom.

When I look at this problem, my thought process unfolds in five distinct steps:

First, I identify the core requirement: "top 3 distinct scores per classroom." This phrasing tells me that if three students in classroom 101 all score 100, all three share 1st place. The student with 95 is in 2nd place, and the student with 90 is in 3rd place. All of these students must appear in the final result set.

Second, I evaluate why a naive brute-force approach fails. Without window functions, developers often write a correlated subquery counting how many distinct scores in the same classroom are strictly higher than the current student's score:

```sql
SELECT e1.* 
FROM ExamResults e1 
WHERE (
    SELECT COUNT(DISTINCT e2.score) 
    FROM ExamResults e2 
    WHERE e2.classroom_id = e1.classroom_id 
      AND e2.score > e1.score
) < 3;
```

This correlated subquery runs an $O(N)$ scan for every single row in `ExamResults`, producing an overall time complexity of $O(N^2)$ or $O(N \cdot M)$ where $M$ is the average classroom size. On a table with 500,000 exam records, this locks up database worker threads and results in unacceptable query latency.

Third, I evaluate why `ROW_NUMBER()` and `RANK()` produce incorrect business results:
- If I use `ROW_NUMBER() <= 3`, the database arbitrarily selects only 3 student records per classroom. If three students tie with 100, the student with 95 is completely dropped, which violates the requirement of finding the top 3 distinct score tiers.
- If I use `RANK() <= 3`, ties cause gaps. If two students tie for 1st place ($1, 1$), the next student receives rank 3 ($3$). But if three students tie for 1st place ($1, 1, 1$), the next student receives rank 4, meaning rank 2 and rank 3 are skipped, and the students with 95 and 90 are omitted entirely.

Fourth, I recognize that `DENSE_RANK()` is the mathematically correct tool. Grouping by `classroom_id` via `PARTITION BY classroom_id` keeps ranking boundaries isolated per classroom. Ordering by `score DESC` guarantees that higher scores receive lower numeric rank integers ($1, 2, 3$).

Fifth, I structure the query using a CTE. Because window functions evaluate during the projection phase of the query engine, I compute `rank_pos` inside the CTE, and then filter `WHERE rank_pos <= 3` in the outer query.

## 3. The Solution — Fully Explained Code

To see the behavioral differences before writing the final query, consider how each window function processes identical input scores:

| student_id | classroom_id | score | ROW_NUMBER() | RANK() | DENSE_RANK() | Why DENSE_RANK() Fits "Top 3 Distinct" |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 101 | A | 100 | 1 | 1 | 1 | Shared gold tier |
| 102 | A | 100 | 2 | 1 | 1 | Shared gold tier |
| 103 | A | 95 | 3 | 3 (Gap: 2 skipped) | 2 | Contiguous silver tier |
| 104 | A | 90 | 4 | 4 (Excluded by <=3) | 3 | Contiguous bronze tier (Included!) |
| 105 | A | 85 | 5 | 5 | 4 | 4th distinct tier (Excluded) |

Here is the complete, production-ready SQL solution:

```sql
WITH RankedScores AS (
    SELECT 
        student_id, 
        classroom_id, 
        score, 
        DENSE_RANK() OVER (
            PARTITION BY classroom_id 
            ORDER BY score DESC
        ) AS rank_pos 
    FROM ExamResults
) 
SELECT 
    classroom_id, 
    rank_pos, 
    score, 
    student_id 
FROM RankedScores 
WHERE rank_pos <= 3 
ORDER BY 
    classroom_id ASC, 
    rank_pos ASC, 
    student_id ASC;
```

Let's break down the technical decisions in this query:

- `WITH RankedScores AS (...)`: Encapsulates the window evaluation into an inline temporary result set. The database engine calculates the window column during this step, making `rank_pos` available as a concrete column name for the subsequent `WHERE` clause filter.
- `DENSE_RANK() OVER (...)`: Directs the database to generate gapless ranking integers starting at 1 for each distinct score value.
- `PARTITION BY classroom_id`: Divides the underlying dataset into independent window partitions per classroom. When the window engine moves across classroom boundaries (for example, from classroom A to classroom B), the rank counter resets back to 1.
- `ORDER BY score DESC`: Dictates the sorting order inside each partition frame. The highest score gets rank 1, ties get identical ranks, and the next lower distinct score receives rank 2.
- `WHERE rank_pos <= 3`: Filters the rows so only students in the top 3 distinct score tiers are returned.
- `ORDER BY classroom_id ASC, rank_pos ASC, student_id ASC`: Ensures the outer query produces a deterministic, well-organized output suitable for direct frontend display or API consumption.

Complexity Analysis:
- Time Complexity: $O(N \log N)$ where $N$ is the total number of rows in `ExamResults`. The query is bounded by the cost of sorting the records within each partition. If a composite index on `(classroom_id, score DESC)` exists, the engine reads the index in presorted order, reducing execution time to an $O(N)$ sequential index scan.
- Space Complexity: $O(N)$ in temporary memory buffers (or disk spill for very large datasets) to materialize the partition frames and CTE output before applying the outer filter.

## 4. Dry Run — Walk Through a Real Example

Let's trace how the database executes this query against a concrete sample dataset.

Input Table `ExamResults`:

| student_id | classroom_id | score |
| :--- | :--- | :--- |
| S1 | 101 | 100 |
| S2 | 101 | 100 |
| S3 | 101 | 95 |
| S4 | 101 | 90 |
| S5 | 101 | 90 |
| S6 | 101 | 80 |
| S7 | 102 | 98 |
| S8 | 102 | 98 |
| S9 | 102 | 88 |
| S10 | 102 | 75 |

Step 1: Partitioning and Window Sorting
The database splits the rows into two partitions (`classroom_id = 101` and `classroom_id = 102`) and sorts each partition by `score DESC`.

Step 2: Assigning `DENSE_RANK()` in Partition `101`:
- Row 1: S1 has score 100. Previous score was none. `rank_pos` = 1.
- Row 2: S2 has score 100. Matches previous score (100). `rank_pos` remains 1.
- Row 3: S3 has score 95. Different from previous score. `rank_pos` increments by 1 to 2.
- Row 4: S4 has score 90. Different from previous score. `rank_pos` increments by 1 to 3.
- Row 5: S5 has score 90. Matches previous score (90). `rank_pos` remains 3.
- Row 6: S6 has score 80. Different from previous score. `rank_pos` increments by 1 to 4.

Step 3: Assigning `DENSE_RANK()` in Partition `102` (Counter resets to 1):
- Row 7: S7 has score 98. Previous score was none. `rank_pos` = 1.
- Row 8: S8 has score 98. Matches previous score (98). `rank_pos` remains 1.
- Row 9: S9 has score 88. Different from previous score. `rank_pos` increments to 2.
- Row 10: S10 has score 75. Different from previous score. `rank_pos` increments to 3.

Step 4: Outer Query Filtering `WHERE rank_pos <= 3`
The filter removes Row 6 (S6, `rank_pos` = 4). All other rows satisfy `rank_pos <= 3`.

Final Result Set:

| classroom_id | rank_pos | score | student_id |
| :--- | :--- | :--- | :--- |
| 101 | 1 | 100 | S1 |
| 101 | 1 | 100 | S2 |
| 101 | 2 | 95 | S3 |
| 101 | 3 | 90 | S4 |
| 101 | 3 | 90 | S5 |
| 102 | 1 | 98 | S7 |
| 102 | 1 | 98 | S8 |
| 102 | 2 | 88 | S9 |
| 102 | 3 | 75 | S10 |

Notice that classroom 101 returned 5 student rows because of ties, but exactly 3 distinct score tiers (100, 95, 90) were captured.

## 5. Edge Cases — The Ones That Break Naive Solutions

Here are the critical real-world edge cases and database behaviors that expose fragile SQL implementations:

- `NULL` Score Ordering Across Different SQL Dialects:
  In SQL, `NULL` values participate in sorting, but database engines disagree on where they go by default. In PostgreSQL and Oracle, `ORDER BY score DESC` treats `NULL` as the largest possible value, placing `NULL` rows at the very top (`rank_pos = 1`). In MySQL and SQL Server, `NULL` is treated as the smallest value, placing it at the bottom. If a student missed an exam and has `score IS NULL`, they could unexpectedly receive rank 1 in PostgreSQL.
  The fix is to be explicit in your query by adding `NULLS LAST` or filtering out nulls in the CTE:
  `DENSE_RANK() OVER (PARTITION BY classroom_id ORDER BY score DESC NULLS LAST)` or `WHERE score IS NOT NULL`.

- Classrooms with Fewer Than 3 Distinct Scores:
  If a classroom only has two students or if all students in a classroom scored 100, the partition will only produce `rank_pos = 1` or `rank_pos IN (1, 2)`. `DENSE_RANK()` gracefully handles this without runtime errors, returning all qualifying rows without requiring special conditional branching.

- Huge Ties and Unbounded Result Sets:
  If 500 students in a single classroom all score 100, all 500 will receive `rank_pos = 1` and all 500 will be returned by `WHERE rank_pos <= 3`. If your application has strict UI display limits (such as showing only top 3 cards on a dashboard), returning 500 rows might break frontend layouts. In such cases, discuss with your interviewer whether ties should expand the result set or whether a secondary deterministic tiebreaker (like `student_id ASC`) with `ROW_NUMBER()` is required.

- Missing Database Indexes on High-Volume Tables:
  Running `DENSE_RANK()` with `PARTITION BY classroom_id ORDER BY score DESC` on an unindexed table forces the database engine to perform a full table scan and allocate an in-memory sort buffer (like `Sort` / `WindowAgg` in PostgreSQL or `Using filesort` in MySQL).
  To make this query lightning-fast in production, add a composite index matching the partition and order keys:
  `CREATE INDEX idx_exam_classroom_score ON ExamResults (classroom_id, score DESC, student_id);`
  This composite index allows the query planner to satisfy both the partition grouping and the descending sort directly from the B-Tree index structure, skipping explicit sorting operations entirely.

## 6. Variations and Follow-ups

Interviewers frequently follow up with these common variations:

- Finding the Overall N-th Highest Value (Global Ranking):
  "How would you find the 2nd highest exam score or salary across the entire organization?"
  Instead of partitioning by a dimension, omit `PARTITION BY` to create a single global window across all rows:
  ```sql
  WITH RankedScores AS (
      SELECT 
          score, 
          DENSE_RANK() OVER (ORDER BY score DESC) AS rnk 
      FROM ExamResults
  ) 
  SELECT DISTINCT score 
  FROM RankedScores 
  WHERE rnk = 2;
  ```

- Bottom-N Per Category:
  "How would you find the 3 lowest distinct scores per classroom?"
  Simply flip the sort direction in the window specification from `DESC` to `ASC`:
  `DENSE_RANK() OVER (PARTITION BY classroom_id ORDER BY score ASC)`

- Combining `DENSE_RANK()` with Strict Row Limits:
  "What if we want top 3 distinct scores, but at most 10 students total per classroom if there are massive ties?"
  Compute both `DENSE_RANK()` and `ROW_NUMBER()` inside the same CTE, then filter on both conditions:
  ```sql
  WITH RankedScores AS (
      SELECT 
          student_id, 
          classroom_id, 
          score, 
          DENSE_RANK() OVER (
              PARTITION BY classroom_id ORDER BY score DESC
          ) AS rank_pos,
          ROW_NUMBER() OVER (
              PARTITION BY classroom_id ORDER BY score DESC, student_id ASC
          ) AS row_pos
      FROM ExamResults
  )
  SELECT classroom_id, rank_pos, score, student_id
  FROM RankedScores
  WHERE rank_pos <= 3 AND row_pos <= 10
  ORDER BY classroom_id, rank_pos, student_id;
  ```

- Legacy SQL Without Window Functions (Pre-MySQL 8.0):
  If asked how this was solved before window functions existed, explain that developers had to rely on correlated subqueries counting distinct higher scores or self-joins with `GROUP BY` and `HAVING COUNT(DISTINCT ...) < 3`. Demonstrating knowledge of the legacy approach highlights why modern window functions were such a revolutionary performance and readability improvement.

## 7. 🧠 The Memory Hook

To instantly pick the right ranking function under pressure, remember this rule:

**`ROW_NUMBER()` counts rows ($1, 2, 3, 4$). `RANK()` leaves gaps on ties ($1, 2, 2, 4$). `DENSE_RANK()` stays dense ($1, 2, 2, 3$).** 

Whenever a problem asks for "Top N distinct values or tiers," always reach for `DENSE_RANK()` wrapped in a CTE.
