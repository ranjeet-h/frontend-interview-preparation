# Write a Query Using `RANK()` in SQL: Competition Ranking With Gaps

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using `RANK()`, they are evaluating whether you understand standard competition ranking and the mechanics of SQL window functions.

Specifically, they are listening for three core competencies:

- **Understanding tie-breaking semantics:** In real-world leaderboards (such as Olympic sporting events), if two athletes tie for 1st place, both receive Gold medals (rank 1), but the next finisher receives Bronze (rank 3). Rank 2 is skipped entirely because two people finished ahead of the third runner. The interviewer wants to see if you instinctively reach for `RANK()` when ranking gaps are required, as opposed to `DENSE_RANK()` (which assigns rank 2 next) or `ROW_NUMBER()` (which arbitrarily assigns 1 and 2 to tied rows).
- **Window execution lifecycle and filtering:** Window functions execute after `WHERE`, `GROUP BY`, and `HAVING` clauses, but before `ORDER BY` and `LIMIT`. Because window calculations occur during the `SELECT` phase, you cannot filter on `RANK()` directly in a `WHERE` clause. The interviewer tests whether you naturally structure your query with a Common Table Expression (CTE) or subquery to filter top ranks.
- **Partitioning vs correlated subqueries:** A novice writes an $O(N^2)$ correlated subquery that scans the table repeatedly for every row. A senior engineer uses `PARTITION BY` within a window frame, allowing the query engine to sort each category once and assign ranks in an optimal $O(N \log N)$ or indexed $O(N)$ single-pass scan.

## 2. Think Before You Code — The Senior Dev Thought Process

Imagine we need to generate a marathon leaderboard showing the top 3 podium finishers in each race category based on their finish times.

Here is how an experienced engineer reasons through the query before writing it:

- **The Naive Approach (Correlated Subquery):**
  Before window functions existed, you had to count how many runners in the same category ran faster than the current runner:
  ```sql
  SELECT r1.runner_id, r1.category_id, r1.finish_time,
         (SELECT COUNT(*) + 1 
          FROM RaceResults r2 
          WHERE r2.category_id = r1.category_id 
            AND r2.finish_time < r1.finish_time) AS competition_rank
  FROM RaceResults r1;
  ```
  For 10,000 runners, this query executes 10,000 inner scans. That is a quadratic $O(N^2)$ operation that collapses database throughput under production loads.

- **The Window Function Insight:**
  The `RANK()` window function calculates rank deterministically in a single pass over sorted partitions. The mathematical definition of competition rank is:

  $$\text{RANK} = 1 + \text{Count of preceding rows with strictly smaller values}$$

  If zero runners have a faster time, the runner gets $1 + 0 = 1$. If two runners share the fastest time, both have zero runners faster than them, so both receive rank 1. The next runner has 2 runners faster than them, automatically giving them $1 + 2 = 3$.

- **The Execution Order Constraint:**
  We only want the top 3 ranks (`competition_rank <= 3`). However, writing:
  ```sql
  -- INVALID SQL: Will throw a syntax error
  SELECT runner_id, RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS competition_rank
  FROM RaceResults
  WHERE RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) <= 3;
  ```
  fails because the SQL parser evaluates `WHERE` before the window function exists in memory.

- **The Clean Architecture:**
  Use a CTE named `Leaderboard` to partition the dataset by `category_id`, order by `finish_time ASC`, and assign `competition_rank`. Then, select from `Leaderboard` in the outer query and filter with `WHERE competition_rank <= 3`.

## 3. The Solution — Fully Explained Code

```sql
-- Step 1: Calculate competition ranks partitioned by race category
WITH Leaderboard AS (
    SELECT 
        runner_id, 
        category_id, 
        finish_time, 
        -- Partition by category to compute independent ranks per division.
        -- Order by finish_time ascending so the fastest times receive the lowest rank numbers.
        RANK() OVER (
            PARTITION BY category_id 
            ORDER BY finish_time ASC
        ) AS competition_rank 
    FROM RaceResults
) 
-- Step 2: Filter for podium finishers (ranks 1, 2, and 3)
SELECT 
    runner_id, 
    category_id, 
    finish_time, 
    competition_rank 
FROM Leaderboard 
WHERE competition_rank <= 3 
ORDER BY category_id ASC, competition_rank ASC, finish_time ASC;
```

### Complexity Analysis

- **Time Complexity:** $O(N \log N)$ without an index, where $N$ is the total number of rows across all partitions. The database sorts the rows by `category_id` and `finish_time`. If a composite B-tree index exists on `(category_id, finish_time ASC)`, the engine skips sorting entirely and streams the ranked rows in $O(N)$ linear time.
- **Space Complexity:** $O(N)$ because the database engine must buffer partition rows or materialize intermediate CTE records before applying the outer `WHERE` filter.

## 4. Dry Run — Walk Through a Real Example

Let us trace a single category (`category_id = 101`) containing 5 runners with finish times. Notice the ties at 1st and 4th place.

### Input Data (`RaceResults` for Category 101)

| runner_id | category_id | finish_time |
| :--- | :--- | :--- |
| 101 | 101 | 02:05:10 |
| 102 | 101 | 02:05:10 |
| 103 | 101 | 02:08:45 |
| 104 | 101 | 02:12:00 |
| 105 | 101 | 02:12:00 |

### Step-by-Step Rank Computation

We evaluate each row using the formula: $\text{RANK} = 1 + \text{Count of preceding rows with strictly smaller finish times}$.

- **Row 1 (`runner_id = 101`, `02:05:10`):**
  - Preceding rows with strictly smaller time: `0`
  - Formula: $1 + 0 = 1$
  - Result: `competition_rank = 1`

- **Row 2 (`runner_id = 102`, `02:05:10`):**
  - Preceding rows with strictly smaller time: `0` (Row 1 has an identical time, not strictly smaller)
  - Formula: $1 + 0 = 1$
  - Result: `competition_rank = 1` (Tied for Gold)

- **Row 3 (`runner_id = 103`, `02:08:45`):**
  - Preceding rows with strictly smaller time: `2` (Rows 1 and 2)
  - Formula: $1 + 2 = 3$
  - Result: `competition_rank = 3` (Bronze medal; rank 2 was skipped!)

- **Row 4 (`runner_id = 104`, `02:12:00`):**
  - Preceding rows with strictly smaller time: `3` (Rows 1, 2, and 3)
  - Formula: $1 + 3 = 4$
  - Result: `competition_rank = 4`

- **Row 5 (`runner_id = 105`, `02:12:00`):**
  - Preceding rows with strictly smaller time: `3` (Rows 1, 2, and 3)
  - Formula: $1 + 3 = 4$
  - Result: `competition_rank = 4` (Tied for 4th; rank 5 will be skipped for anyone slower)

### Output After Applying `WHERE competition_rank <= 3`

| runner_id | category_id | finish_time | competition_rank | Status |
| :--- | :--- | :--- | :--- | :--- |
| 101 | 101 | 02:05:10 | 1 | Included (Gold) |
| 102 | 101 | 02:05:10 | 1 | Included (Gold) |
| 103 | 101 | 02:08:45 | 3 | Included (Bronze) |
| 104 | 101 | 02:12:00 | 4 | Filtered out ($> 3$) |
| 105 | 101 | 02:12:00 | 4 | Filtered out ($> 3$) |

The final output correctly returns 3 runners with competition ranks $1, 1, 3$.

## 5. Edge Cases — The Ones That Break Naive Solutions

- **`NULL` Values in the Order Column:**
  If a runner Did Not Finish (DNF), their `finish_time` might be `NULL`. In SQL standard and PostgreSQL, `NULL` values sort highest by default in `ASC` order (`NULLS LAST`), but in MySQL and SQL Server, `NULL` values sort lowest in `ASC` order (`NULLS FIRST`). If a DNF runner has `NULL` finish time and sorts first, they get assigned `competition_rank = 1`.
  *Fix:* Explicitly declare null placement or filter out invalid rows:
  ```sql
  RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC NULLS LAST)
  ```
  or add `WHERE finish_time IS NOT NULL` inside the CTE.

- **All Rows in a Partition Tie:**
  If 10 runners all finish at the exact same second, every single runner gets `competition_rank = 1`. A query filtering on `WHERE competition_rank <= 3` returns all 10 runners. In competition rules, all 10 are legitimate medalists. If the product requirement strictly mandates returning at most 3 physical database rows, you must combine `RANK()` with a deterministic tie-breaker or use `ROW_NUMBER()`.

- **Partitions with Fewer Rows Than the Filter Threshold:**
  If a category only has 1 or 2 participants, the window function still assigns ranks 1 and 2 normally without throwing errors or truncating results.

- **Multiple Concurrent Partitions with Huge Volumes:**
  If the table has millions of rows across thousands of categories, performing in-memory sorts for every partition will exhaust database memory (`work_mem` in PostgreSQL) and spill to temporary disk files.
  *Fix:* Create a composite B-tree index on `(category_id, finish_time ASC)`. The query planner uses an index scan to evaluate partitions and ranking in pipeline order with zero sort overhead.

## 6. Variations and Follow-ups

- **Percentile Ranking with `PERCENT_RANK()`:**
  If the interviewer asks: *"How do you calculate each runner's percentile standing relative to their category?"*
  The `PERCENT_RANK()` window function calculates relative rank as a decimal between `0.0` (fastest) and `1.0` (slowest):

  $$\text{PERCENT\_RANK} = \frac{\text{RANK} - 1}{\text{Total Rows in Partition} - 1}$$

  ```sql
  SELECT 
      runner_id,
      category_id,
      finish_time,
      RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS comp_rank,
      PERCENT_RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS pct_rank
  FROM RaceResults;
  ```
  For our 5-runner example:
  - Rank 1: $(1 - 1) / (5 - 1) = 0.0$ (0th percentile / top performer)
  - Rank 3: $(3 - 1) / (5 - 1) = 0.5$ (50th percentile)
  - Rank 4: $(4 - 1) / (5 - 1) = 0.75$ (75th percentile)

- **Comparing the Big Three Ranking Functions:**
  Interviewers frequently ask to compare `RANK()`, `DENSE_RANK()`, and `ROW_NUMBER()` on the exact same values (`10, 10, 20, 30, 30`):

  | Finish Time | `RANK()` | `DENSE_RANK()` | `ROW_NUMBER()` |
  | :--- | :--- | :--- | :--- |
  | 10 | 1 | 1 | 1 |
  | 10 | 1 | 1 | 2 |
  | 20 | 3 (skips 2) | 2 (no gap) | 3 |
  | 30 | 4 (skips to count) | 3 (no gap) | 4 |
  | 30 | 4 | 3 | 5 |

  - **`RANK()`:** Competition rank. Tied values share a rank, and the next rank skips by the number of tied rows.
  - **`DENSE_RANK()`:** Consecutive group rank. Tied values share a rank, and the next rank is strictly $+1$ with no gaps.
  - **`ROW_NUMBER()`:** Unique sequential integer. Every row receives a distinct number ($1, 2, 3, 4, 5$), breaking ties arbitrarily unless an extra tiebreaker column is provided in `ORDER BY`.

- **Finding the Size of Ties (Density Count):**
  If asked to show how many runners tied at each rank:
  ```sql
  SELECT 
      runner_id,
      category_id,
      finish_time,
      RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS comp_rank,
      COUNT(*) OVER (PARTITION BY category_id, finish_time) AS tie_count
  FROM RaceResults;
  ```

## 7. 🧠 The Memory Hook

`RANK()` honors the Olympic podium: if two athletes win Gold ($1, 1$), the next runner takes Bronze ($3$).

Your rank is always **$1 + \text{the number of people who crossed the finish line before you}$**.
