# Write a Query Using `ROW_NUMBER()` in SQL: Deduplication, Pagination, and Top-N per Group

## 1. What the Interviewer Is Really Testing

You get a ticket that says "show the latest status for every device" or "clean up duplicate rows" or "give me page 3 of the results." The naive fix is to sort the whole table and grab the first row, or to group by the device and take the max timestamp. That works in a demo with ten rows. In production it breaks.

If two rows share the same timestamp, the group-and-join trick returns both rows when you only wanted one. If you try to paginate with `LIMIT` and `OFFSET` without a stable order, the same row can appear on two pages after a new insert. If you try `WHERE ROW_NUMBER() = 1` in the same query, Postgres throws an error because window functions run later than `WHERE`.

When an interviewer asks for `ROW_NUMBER()`, they are checking four things at once. Do you know that `ROW_NUMBER() OVER (ORDER BY ...)` hands out unique, sequential numbers 1, 2, 3 with no ties sharing a number, unlike `RANK()` and `DENSE_RANK()` which do share. Do you know when to partition (`PARTITION BY device_id`) so each device gets its own 1, 2, 3. Do you know you need a CTE or subquery because a window lives in the SELECT phase. And do you know the two real uses they care about: deduplication where you keep `rn = 1` and delete `rn > 1`, and pagination where you keep a range like `rn BETWEEN 21 AND 40`, plus Top-N per group where you keep `rn <= N`.

## 2. Think Before You Code — The Senior Dev Thought Process

The first thing I notice in the prompt is the phrase "per device" or "per user" or "latest" or "page." That tells me I need one row per group, not an aggregate that collapses data.

My instinct used to be the `GROUP BY` plus self-join:

```
SELECT * FROM DeviceLogs
WHERE (device_id, recorded_at) IN (
  SELECT device_id, MAX(recorded_at) FROM DeviceLogs GROUP BY device_id
)
```

But then I remember the tie trap. If device DEV-101 has two rows both at `12:00:00`, `MAX(recorded_at)` is `12:00:00` and the `IN` matches both rows. I wanted one, I got two. It also needs two passes over the table and a join, which hurts on large tables.

So I ask what data structure gives me one row per group in a single pass and lets me decide which tied row wins. That is a window. I will cut the table into buckets with `PARTITION BY device_id`, sort inside each bucket with `ORDER BY recorded_at DESC`, and hand out numbers. But sorting only by `recorded_at` is not enough, because equal timestamps have no defined order. I need a tie-breaker that is unique and stable, like the primary key `id DESC`. Then the newest timestamp wins, and if timestamps tie, the higher `id` wins, and the order is deterministic every run, on every replica.

The high-level plan becomes: partition, order with tie-breaker, assign `ROW_NUMBER()`, wrap in a CTE, filter `rn = 1` for latest, `rn > 1` for duplicates to delete, or `rn BETWEEN` for a page, or `rn <= 3` for top 3 per group. That pattern covers every follow-up they can ask.

## 3. The Solution — Fully Explained Code

This SQL runs in SQLite, Postgres, MySQL 8+, and SQL Server. The only dialect-specific part is how you delete, which is labeled below. Create the table once and all three queries work.

```sql
-- Setup: runnable in sqlite3 :memory: or any modern SQL DB
CREATE TABLE DeviceLogs (
  id INTEGER PRIMARY KEY,
  device_id TEXT NOT NULL,
  status TEXT NOT NULL,
  recorded_at TEXT NOT NULL  -- ISO-8601 for SQLite; use TIMESTAMP in Postgres
);

INSERT INTO DeviceLogs (id, device_id, status, recorded_at) VALUES
  (1, 'DEV-101', 'OFFLINE', '2026-03-01 10:00:00'),
  (2, 'DEV-101', 'ONLINE',  '2026-03-01 12:00:00'),
  (3, 'DEV-101', 'ERROR',   '2026-03-01 12:00:00'),
  (4, 'DEV-202', 'ONLINE',  '2026-03-01 09:00:00'),
  (5, 'DEV-202', 'OFFLINE', '2026-03-01 11:30:00'),
  (6, 'DEV-202', 'ONLINE',  '2026-03-01 11:30:00');
```

**Use 1: Latest one row per device (Greatest-N-Per-Group, N=1)**

```sql
WITH Ranked AS (
  SELECT
    device_id,
    status,
    recorded_at,
    id,
    -- Within each device_id, newest first. id DESC breaks ties so order is total.
    -- ROW_NUMBER gives 1,2,3 with no shared ranks even when recorded_at ties.
    ROW_NUMBER() OVER (
      PARTITION BY device_id
      ORDER BY recorded_at DESC, id DESC
    ) AS rn
  FROM DeviceLogs
)
SELECT device_id, status, recorded_at, id
FROM Ranked
WHERE rn = 1
ORDER BY device_id;
-- Result: DEV-101 -> id 3 (ERROR, 12:00), DEV-202 -> id 6 (ONLINE, 11:30)
```

Why the CTE: window functions are computed during the SELECT phase, after FROM, WHERE, GROUP BY, and HAVING. You cannot put `ROW_NUMBER() OVER (...) = 1` in the same WHERE. The CTE materializes `rn` first, then the outer WHERE filters it.

**Use 2: Pagination — page 2 with 2 rows per page**

```sql
WITH Numbered AS (
  SELECT
    device_id, status, recorded_at, id,
    -- No PARTITION BY here: we number the whole result set for global pagination.
    -- Always include a unique tie-breaker; ORDER BY recorded_at alone is unstable.
    ROW_NUMBER() OVER (ORDER BY recorded_at DESC, id DESC) AS rn
  FROM DeviceLogs
)
SELECT device_id, status, recorded_at, id, rn
FROM Numbered
WHERE rn BETWEEN 3 AND 4   -- page 2: rows 3-4 (page 1 would be 1-2)
ORDER BY rn;
```

Pagination with `ROW_NUMBER()` is explicit and works on every engine. For deep pagination on huge tables, prefer keyset pagination (`WHERE (recorded_at, id) < (?, ?)`) over large `BETWEEN` offsets, but interviews expect this `BETWEEN` form.

**Use 3: Deduplication — keep one copy, delete the rest**

Assume duplicates mean same `(device_id, status, recorded_at)`. Keep the smallest `id`.

```sql
-- Step A: preview what would be deleted (always do this first in production)
WITH Ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY device_id, status, recorded_at
      ORDER BY id ASC
    ) AS rn
  FROM DeviceLogs
)
SELECT * FROM Ranked WHERE rn > 1;

-- Step B: delete (Postgres / SQLite form)
WITH Ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY device_id, status, recorded_at
      ORDER BY id ASC
    ) AS rn
  FROM DeviceLogs
)
DELETE FROM DeviceLogs
WHERE id IN (SELECT id FROM Ranked WHERE rn > 1);
```

SQL Server lets you delete from the CTE directly:

```sql
-- SQL Server only: CTE is updatable
WITH Ranked AS (
  SELECT ROW_NUMBER() OVER (
    PARTITION BY device_id, status, recorded_at ORDER BY id ASC
  ) AS rn
  FROM DeviceLogs
)
DELETE FROM Ranked WHERE rn > 1;
```

Time complexity is O(N log N) when the engine must sort each partition. If you have a covering index like `CREATE INDEX idx ON DeviceLogs(device_id, recorded_at DESC, id DESC)`, the engine can scan the index in order and avoid sorting, dropping toward O(N). Space is O(N) for window buffers during execution, streamed to O(1) extra when reading from a sorted index.

## 4. Dry Run — Walk Through a Real Example

Take the six rows inserted above. Focus on the query `ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY recorded_at DESC, id DESC)`.

**Step 1: Partition**

Rows split into two buckets: `DEV-101` holds ids 1,2,3 and `DEV-202` holds ids 4,5,6.

**Step 2: Sort inside each partition**

For `DEV-101`, sort by `recorded_at DESC, id DESC`: id 3 (12:00, id 3) before id 2 (12:00, id 2) because id breaks the timestamp tie, then id 1 (10:00). For `DEV-202`, sort gives id 6 (11:30, id 6) before id 5 (11:30, id 5) for the same tie reason, then id 4 (09:00).

**Step 3: Assign ROW_NUMBER**

DEV-101: id 3 gets rn 1, id 2 gets rn 2, id 1 gets rn 3. DEV-202: id 6 gets rn 1, id 5 gets rn 2, id 4 gets rn 3. Every row gets a different number, even ties.

The intermediate CTE looks like this:

```
id | device_id | recorded_at         | rn
3  | DEV-101   | 2026-03-01 12:00:00 | 1
2  | DEV-101   | 2026-03-01 12:00:00 | 2
1  | DEV-101   | 2026-03-01 10:00:00 | 3
6  | DEV-202   | 2026-03-01 11:30:00 | 1
5  | DEV-202   | 2026-03-01 11:30:00 | 2
4  | DEV-202   | 2026-03-01 09:00:00 | 3
```

Filtering `WHERE rn = 1` keeps only id 3 and id 6, one per device, deterministic.

**Same data, what RANK and DENSE_RANK would do**

This is the difference interviewers want you to say clearly. With ties at `12:00` and `11:30`:

```
Partition DEV-101 sorted by recorded_at DESC only:
  id 3 (12:00) -> ROW_NUMBER 1 | RANK 1 | DENSE_RANK 1
  id 2 (12:00) -> ROW_NUMBER 2 | RANK 1 | DENSE_RANK 1
  id 1 (10:00) -> ROW_NUMBER 3 | RANK 3 | DENSE_RANK 2
```

`ROW_NUMBER` always gives 1,2,3 — unique and sequential, no sharing, no gaps. `RANK` gives 1,1,3 — tied rows share the same rank and the next rank skips (gap). `DENSE_RANK` gives 1,1,2 — tied rows share and the next rank does not skip (no gap).

A classic standalone comparison with scores makes the same point: scores `100, 90, 90, 80` produce ROW_NUMBER 1,2,3,4; RANK 1,2,2,4; DENSE_RANK 1,2,2,3. If the prompt says "exactly one row per group" or "page of N rows," you need ROW_NUMBER. If it says "all rows in the top 3 tiers including ties," you need DENSE_RANK.

## 5. Edge Cases — The Ones That Break Naive Solutions

**Putting the window in WHERE in the same query** — `SELECT ... WHERE ROW_NUMBER() OVER (...) = 1` fails with `window functions not allowed in WHERE`. Windows run after WHERE in the logical order FROM -> WHERE -> GROUP BY -> HAVING -> SELECT/WINDOW -> ORDER BY. Fix is the CTE or derived table, then filter outside.

**Ordering tie indeterminism without a tie-breaker** — `ORDER BY recorded_at DESC` alone leaves the order of equal timestamps undefined. The SQL standard says the engine can return tied rows in any order, and it can change after an index rebuild, a vacuum, or a parallel plan. Row 2 might win today and row 3 tomorrow. Always add a unique column like `id DESC` or `created_at DESC, id DESC` to make the order total and reproducible.

**NULLs in PARTITION BY and ORDER BY** — All rows where the `PARTITION BY` key is NULL land in one partition. For `ORDER BY`, engines differ: Postgres treats NULLS as larger than any value so `NULL` sorts first in DESC, while MySQL and SQL Server treat NULLS as smaller so `NULL` sorts last in DESC. If `recorded_at` can be NULL, be explicit: Postgres `ORDER BY recorded_at DESC NULLS LAST, id DESC`; MySQL `ORDER BY recorded_at IS NULL, recorded_at DESC, id DESC`.

**Batch size for deletes on large tables** — `DELETE WHERE id IN (SELECT id FROM Ranked WHERE rn > 1)` on 50 million rows can hold locks, bloat WAL/undo, and lag replicas. In production, delete in batches of 5k-50k by id range, or create a clean table `INSERT INTO new_table SELECT ... WHERE rn = 1` and swap it with `ALTER TABLE ... RENAME`. Always preview the `SELECT WHERE rn > 1` before you delete.

**Pagination drift on changing data** — `ROW_NUMBER() OVER (ORDER BY recorded_at DESC)` for `BETWEEN 21 AND 40` gives a stable page only if the ORDER BY is deterministic. Without `id` tie-breaker, a new row with the same timestamp can shift every row number between pages. With the tie-breaker, pages are stable for a snapshot.

## 6. Variations and Follow-ups

**ROW_NUMBER vs RANK vs DENSE_RANK — when to pick which** — Need exactly N rows per group with no duplicates sharing a rank: ROW_NUMBER. Need leaderboard tiers where all tied scores share the medal and the next tier is contiguous: DENSE_RANK. Need Olympic ranking where ties share but next position skips: RANK. Example: top 2 salary tiers per department including ties calls for `DENSE_RANK() OVER (PARTITION BY dept ORDER BY salary DESC) <= 2`; top 1 row per device ignoring ties calls for `ROW_NUMBER() = 1`.

**Top N per group, not just Top 1** — Change `= 1` to `<= N`. For three most recent logs per device: same window as before, outer query `WHERE rn <= 3`. This is ROW_NUMBER per partition for Top N, the core interview pattern. To get Top N globally without partitions, drop `PARTITION BY`.

**Pagination range** — Same window without `PARTITION BY`, filter `rn BETWEEN ((page-1)*size+1) AND (page*size)`. Mention OFFSET as alternative: `ORDER BY recorded_at DESC, id DESC LIMIT 20 OFFSET 40`. ROW_NUMBER form is preferred when you need the number itself or must work inside a CTE chain.

**QUALIFY — filter without a CTE** — Snowflake, BigQuery, and Databricks support `QUALIFY` which filters a window directly: `SELECT device_id, status FROM DeviceLogs QUALIFY ROW_NUMBER() OVER (PARTITION BY device_id ORDER BY recorded_at DESC, id DESC) = 1`. Postgres, MySQL, SQLite, and SQL Server do not support QUALIFY; use a CTE there.

**Postgres DISTINCT ON for Top-1 only** — Postgres can do `SELECT DISTINCT ON (device_id) device_id, status, recorded_at FROM DeviceLogs ORDER BY device_id, recorded_at DESC, id DESC`. It keeps the first row per `device_id` in the given order. It is often faster for N=1 but it is Postgres-only and cannot express N > 1, so do not use it if the follow-up becomes Top 3.

## 7. 🧠 The Memory Hook

`PARTITION BY` cuts the table into rooms, `ORDER BY` lines everyone up with an ID badge to break ties, and `ROW_NUMBER` hands out strict tickets 1, 2, 3 — no sharing, no skipping, so you can keep ticket 1, throw away >1, or tear off a range for a page.
