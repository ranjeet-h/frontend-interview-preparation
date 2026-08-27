# Write a Query Using `RANK()` in SQL: Competition Ranking With Gaps

## 1. What the Interviewer Is Really Testing

When an interviewer asks you to write a query using `RANK()`, they are not testing whether you can memorize syntax. They are testing whether you understand competition ranking — the kind where ties leave gaps.

Think of the Olympics. Two runners tie for gold. Both get rank 1. Nobody gets rank 2. The next runner gets rank 3, bronze. That gap after a tie is the whole point of `RANK()`. If you reach for `DENSE_RANK()` you get 1, 1, 2 — no gap. If you reach for `ROW_NUMBER()` you get 1, 2, 3 — ties are broken arbitrarily. Picking the wrong one changes who makes the podium.

Interviewers also listen for two more things. First, do you know where window functions run in the SQL lifecycle? They run after `WHERE`, `GROUP BY`, and `HAVING`, so you cannot filter on `RANK()` in the same `WHERE` clause — you need a CTE or subquery. Second, do you know how to scope ranking with `PARTITION BY` instead of writing a slow correlated subquery that scans the table once per row?

## 2. Think Before You Code — The Senior Dev Thought Process

Imagine we need a marathon leaderboard: top 3 podium finishers per race category, ordered by finish time.

The first thing I notice is that ranking inside each category is not a `GROUP BY` problem — we do not want one row per group, we want every runner back with an extra rank column. That immediately says window function, not aggregation.

My instinct for a brute-force version is a correlated subquery: for each runner, count how many runners in the same category finished faster, then add one.

```sql
SELECT r1.runner_id, r1.category_id, r1.finish_time,
       (SELECT COUNT(*) + 1
        FROM RaceResults r2
        WHERE r2.category_id = r1.category_id
          AND r2.finish_time < r1.finish_time) AS competition_rank
FROM RaceResults r1;
```

That works logically. `RANK()` is literally defined as `1 + count of rows with a strictly smaller value`. If nobody is faster, you get 1. If two runners share the fastest time, both count zero faster runners, so both get 1, and the next runner counts two faster runners and gets 3 — the gap appears naturally.

But then I realize the cost. For 10,000 runners this runs 10,000 inner scans. That is O(N²) and it falls over in production.

The window-function insight is that the database can do this in one pass. `RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC)` tells the engine: split rows by category, sort each split by finish time, then walk the sorted list and assign ranks, skipping numbers after ties. No per-row scan, just one sort per partition — O(N log N) without an index, O(N) if a composite index on `(category_id, finish_time)` lets the engine stream in order.

Then I catch the filtering trap. I only want `competition_rank <= 3`, but this fails:

```sql
-- INVALID: WHERE runs before the window is computed
SELECT runner_id, RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS competition_rank
FROM RaceResults
WHERE RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) <= 3;
```

`WHERE` is evaluated before the `SELECT` phase where windows live, so the rank does not exist yet. The fix is to compute ranks in a CTE and filter in the outer query. That outer `WHERE` runs after the CTE materializes, so it sees the rank just fine.

So the high-level plan before any code is: CTE that partitions by `category_id`, orders by `finish_time ASC`, computes `RANK()`, outer query filters `competition_rank <= 3` and orders nicely.

## 3. The Solution — Fully Explained Code

This is runnable on any modern SQL database that supports window functions — PostgreSQL, MySQL 8+, SQL Server, Oracle, and SQLite 3.25+. The `NULLS LAST` variant noted in edge cases is PostgreSQL/Oracle syntax.

```sql
-- Step 1: Compute competition ranks per category in a single pass
WITH Leaderboard AS (
    SELECT
        runner_id,
        category_id,
        finish_time,
        -- PARTITION BY gives each category its own ranking.
        -- ORDER BY finish_time ASC means fastest time = rank 1.
        -- RANK() leaves gaps after ties (1, 1, 3), unlike DENSE_RANK.
        RANK() OVER (
            PARTITION BY category_id
            ORDER BY finish_time ASC
        ) AS competition_rank
    FROM RaceResults
)
-- Step 2: Keep only podium finishers. Filtering must happen here,
-- not inside the CTE, because window results are not visible to WHERE
-- in the same SELECT.
SELECT
    runner_id,
    category_id,
    finish_time,
    competition_rank
FROM Leaderboard
WHERE competition_rank <= 3
ORDER BY category_id ASC, competition_rank ASC, finish_time ASC;
```

Why this shape: the CTE isolates window computation from filtering. `PARTITION BY category_id` is what makes this "top 3 per group" instead of "top 3 overall" — without it you get a global leaderboard. `ORDER BY finish_time ASC` sets the ranking direction; flip to `DESC` for scores where higher is better.

Time complexity is O(N log N) where N is total rows across all partitions, because the engine sorts by `category_id` and `finish_time`. If a composite B-tree index exists on `(category_id, finish_time ASC)`, the engine can use an index scan and stream ranks in O(N) with no sort.

Space complexity is O(N) in the worst case because the engine must buffer partition rows or materialize the CTE before the outer filter can be applied.

## 4. Dry Run — Walk Through a Real Example

Take one partition, `category_id = 101`, with 5 runners. Two tie for first, two tie for fourth.

**Input data — RaceResults for category 101**

| runner_id | category_id | finish_time |
| :--- | :--- | :--- |
| 101 | 101 | 02:05:10 |
| 102 | 101 | 02:05:10 |
| 103 | 101 | 02:08:45 |
| 104 | 101 | 02:12:00 |
| 105 | 101 | 02:12:00 |

The engine sorts this partition by `finish_time ASC` — the order above is already sorted, with ties kept together.

**Step-by-step rank computation**

We use the definition: `RANK = 1 + count of rows in the same partition with a strictly smaller finish_time`.

Row 1 (`runner_id = 101`, `02:05:10`): zero rows are strictly faster. `1 + 0 = 1`. Result `competition_rank = 1`.

Row 2 (`runner_id = 102`, `02:05:10`): zero rows are strictly faster — row 1 is tied, not faster. `1 + 0 = 1`. Result `competition_rank = 1`, tied for gold.

Row 3 (`runner_id = 103`, `02:08:45`): two rows are strictly faster (101 and 102). `1 + 2 = 3`. Result `competition_rank = 3`. Notice rank 2 never appears — it was skipped because two people occupied rank 1.

Row 4 (`runner_id = 104`, `02:12:00`): three rows are strictly faster (101, 102, 103). `1 + 3 = 4`. Result `competition_rank = 4`.

Row 5 (`runner_id = 105`, `02:12:00`): three rows are strictly faster (same three). `1 + 3 = 4`. Result `competition_rank = 4`, tied for fourth. If another runner finished at `02:15:00`, they would get `1 + 5 = 6`, skipping 5.

**Output after `WHERE competition_rank <= 3`**

| runner_id | category_id | finish_time | competition_rank | Status |
| :--- | :--- | :--- | :--- | :--- |
| 101 | 101 | 02:05:10 | 1 | Included (gold) |
| 102 | 101 | 02:05:10 | 1 | Included (gold) |
| 103 | 101 | 02:08:45 | 3 | Included (bronze) |
| 104 | 101 | 02:12:00 | 4 | Filtered out (> 3) |
| 105 | 101 | 02:12:00 | 4 | Filtered out (> 3) |

Final result is three rows with ranks 1, 1, 3 — exactly the Olympic podium behavior.

## 5. Edge Cases — The Ones That Break Naive Solutions

`NULL` finish times break ranking order. A runner who did not finish might have `finish_time = NULL`. PostgreSQL and the SQL standard sort `NULL` last for `ASC` (`NULLS LAST` by default), but MySQL and SQL Server sort `NULL` first for `ASC`. If `NULL` sorts first, a DNF runner steals rank 1. Fix it explicitly by declaring null placement or removing DNF rows before ranking: use `RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC NULLS LAST)` where supported, or add `WHERE finish_time IS NOT NULL` inside the CTE. In SQLite and MySQL 8, `NULLS LAST` is not supported, so the `WHERE` filter is the portable fix.

All rows in a partition tie and the filter returns more rows than expected. If ten runners all finish at the same second, every runner gets `competition_rank = 1`, so `WHERE competition_rank <= 3` returns ten rows. That is correct for competition ranking — they all tied for gold — but if the product needs at most three physical rows, `RANK()` is the wrong tool. Use `ROW_NUMBER()` with a deterministic tiebreaker like `ORDER BY finish_time ASC, runner_id ASC`, or add a secondary sort key to `RANK()` so the tie is at least ordered.

Partitions with fewer rows than the threshold do not error. A category with only one or two runners still gets ranks 1 and maybe 2. No special handling needed, but be aware the outer query may return 1 row instead of 3 — callers should not assume exactly three per group.

Large partitions spill to disk. With millions of rows across thousands of categories, sorting every partition in memory can exceed `work_mem` in PostgreSQL or the sort buffer in MySQL and spill to temp files. The fix is a composite B-tree index on `(category_id, finish_time ASC)`. The planner can then do an index-ordered scan per partition and assign ranks without sorting at all.

Missing `PARTITION BY` ranks globally instead of per group. If you write `RANK() OVER (ORDER BY finish_time ASC)` without partitioning, the fastest runner in any category gets rank 1 and everyone else is ranked against them. A common interview follow-up is to spot that bug — always confirm whether the question asks for global rank or per-group rank.

## 6. Variations and Follow-ups

Top N per group is the most common follow-up and is exactly what the main query does. `WHERE competition_rank <= 3` in the outer query gives top 3 per `category_id`. Change the filter to `= 1` for "winner per category" or `<= 5` for top 5. If the interviewer wants strictly N rows per group regardless of ties, swap `RANK()` for `ROW_NUMBER()` and keep the same CTE shape.

Dense versus standard ranking comes up immediately after gaps. Show the three functions side by side on the same values `10, 10, 20, 30, 30`:

| Finish Time | `RANK()` | `DENSE_RANK()` | `ROW_NUMBER()` |
| :--- | :--- | :--- | :--- |
| 10 | 1 | 1 | 1 |
| 10 | 1 | 1 | 2 |
| 20 | 3 (skips 2) | 2 (no gap) | 3 |
| 30 | 4 | 3 | 4 |
| 30 | 4 | 3 | 5 |

`RANK()` is competition ranking with gaps, `DENSE_RANK()` is consecutive ranking with no gaps, `ROW_NUMBER()` gives every row a unique number and breaks ties arbitrarily unless you add a tiebreaker column like `ORDER BY finish_time ASC, runner_id ASC`. A clean interview answer is: use `RANK()` when the spec says "skip numbers after ties," use `DENSE_RANK()` when it says "next distinct value is next rank," use `ROW_NUMBER()` when you need exactly one winner.

Percentile standing with `PERCENT_RANK()` is a natural extension. It computes relative position as `(RANK - 1) / (partition_size - 1)`, returning 0.0 for the fastest and 1.0 for the slowest:

```sql
SELECT
    runner_id,
    category_id,
    finish_time,
    RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS comp_rank,
    PERCENT_RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS pct_rank
FROM RaceResults;
```

For the 5-runner example, ranks 1, 1, 3, 4, 4 become percent ranks 0.0, 0.0, 0.5, 0.75, 0.75.

Counting tie density shows how crowded each rank is. Adding `COUNT(*) OVER (PARTITION BY category_id, finish_time)` tells you how many runners share that exact time, which is useful for displaying "tied with 2 others" in a UI:

```sql
SELECT
    runner_id,
    category_id,
    finish_time,
    RANK() OVER (PARTITION BY category_id ORDER BY finish_time ASC) AS comp_rank,
    COUNT(*) OVER (PARTITION BY category_id, finish_time) AS tie_count
FROM RaceResults;
```

For `02:05:10` the `tie_count` is 2, for `02:08:45` it is 1, for `02:12:00` it is 2.

## 7. 🧠 The Memory Hook

`RANK()` is the Olympic podium: two golds means no silver, the next runner gets bronze. Your rank is always one plus the number of people who finished strictly before you, so ties eat the numbers in between.
