# What Are Window Functions

## 1. The Real-World Problem — When You Actually Hit This

Your team ships a sales dashboard. The product manager asks for something that sounds trivial: every deal in a list, with each seller's rank inside their region, their running total since January, and an arrow showing whether this month beat last month. You reach for `GROUP BY` — and immediately hit a wall. `GROUP BY region` gives you one row per region, which is great for "total per region" and useless here, because the moment it aggregates, the individual deals vanish from the result. You cannot rank rows that no longer exist.

So you try plan B: pull all the raw rows into the app and compute ranks and running totals in JavaScript with loops. It works fine with 200 rows in staging. In production there are two million rows, the API takes nine seconds, the Node process eats gigabytes of memory sorting things SQL was born to sort, and the dashboard times out. That exact moment — "I need a calculation per group, but I also need every individual row" — is the moment you need window functions. It's also one of the most common senior-level SQL interview questions in existence, usually disguised as "get the latest order per customer" or "top 3 products per category."

## 2. The Analogy — Make the Mechanic Obvious

Picture an exam hall. Five hundred students sit in rows, grouped into sections A, B, and C. Two different people work in this hall, and the difference between them is the whole topic.

The first person is the school secretary doing `GROUP BY` thinking. She collects every section's papers, computes one average per section, and hands back exactly three summary cards. Section A: 78. Section B: 81. Section C: 74. Useful — but the students themselves are gone. If you now ask "what rank was Priya in her section?", she can't tell you. Priya got merged into a card.

The second person is an invigilator walking down the rows. He visits every student in place, never removes anyone, and writes annotations directly on each student's paper: "you're 2nd in your section," "your score plus everyone before you in this section sums to 214," "the student seated just before you scored 12 points higher." Every student walks out still an individual — but each one now carries extra facts computed by looking around at their neighborhood.

That's a window function. Each row stays in the result untouched; the database just walks past every row, looks at that row's neighborhood (its partition), and stamps the row with a number computed from what it sees. The sections never merge, nobody gets filtered out, and the annotation happens row by row.

Every part of the syntax maps onto this walk. `PARTITION BY region` decides which section of the hall a student belongs to. `ORDER BY ...` inside the window decides the order the invigilator reads that section in — you can't say "2nd highest" until you've decided what "before" means. The frame (which we'll get to) decides how far the invigilator looks while computing each stamp: just the current row, everyone up to the current row, or the whole section.

## 3. The Full Explanation — How It Actually Works

In plain English first: a window function computes a value for each row using other rows from the same "window" — a slice of the result set — without collapsing those rows away. `GROUP BY` answers "one number per group." Window functions answer "for every row, a number about that row's group or its position in it." Both can exist in the same query, which is why you'll often see a grouped aggregate and a window function side by side.

The keyword that unlocks all of this is `OVER`. Any aggregate or ranking function followed by `OVER (...)` becomes a window function. Three pieces go inside the parentheses, and each one has a precise job:

**Empty `OVER()`** means the window is the entire result set — the whole hall is one section. `SUM(amount) OVER ()` stamps every row with the grand total, which instantly gives you "this row's share of the total" by dividing the row's value against it.

**`PARTITION BY`** splits the result set into independent neighborhoods. `RANK() OVER (PARTITION BY region ORDER BY amount DESC)` restarts the ranking from 1 in every region. Crucially — and this is where people trip — partitioning does not remove rows and does not filter anything. It only defines the boundaries the function operates within. Every input row appears exactly once in the output.

**`ORDER BY` inside the window** defines the reading order for the calculation. This is not the query's final `ORDER BY`, which sorts the finished output for display. The inner one controls the math: ranks count downward through this order, running sums accumulate along it, and `LAG`/`LEAD` look backward and forward along it. Same hall, but you've told the invigilator to walk each section in score order instead of seat order.

With those three pieces in place, the standard toolkit falls into four families.

The **ranking family** is `ROW_NUMBER`, `RANK`, and `DENSE_RANK`, and interviews love asking you to distinguish them under ties. Give three sellers amounts of 700, 700, and 500. `ROW_NUMBER()` hands out 1, 2, 3 — it must give every row a distinct number, and between tied rows the choice is arbitrary unless you add a tiebreaker to the order. `RANK()` gives 1, 1, 3 — tied rows share a rank, and the next rank skips ahead by however many rows tied (two rows at 1, so third place is 3). `DENSE_RANK()` gives 1, 1, 2 — ties share a rank but the sequence never skips. Pick by consequence: paginating with `ROW_NUMBER` guarantees fixed page sizes but arbitrary order among ties; prize positions want `RANK` semantics ("two golds, next is bronze"); tier levels want `DENSE_RANK`.

The **running-aggregate family** is where a silent default bites almost everyone once. When you write `SUM(amount) OVER (ORDER BY sold_on)`, you did not specify a frame, so Postgres applies the default: `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. Read that carefully — `RANGE`, not `ROWS`. With `RANGE`, any rows that tie on the ordering value (same `sold_on`) are "peers," and the current row's total includes all of them. So if two sales landed on June 2nd, both rows show the combined sum of both sales, and your running total visibly jumps. Switching one word to `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` counts physical rows instead, giving the strict row-by-row accumulation most people expected. And note the other half of the default: if there's no `ORDER BY` inside the window at all, the frame defaults to the entire partition, so `AVG(amount) OVER (PARTITION BY region)` gives every row its region's average — no running anything.

The **offset family** is `LAG` and `LEAD`: fetch a neighboring row's value without a self-join. `LAG(amount) OVER (PARTITION BY seller_id ORDER BY sold_on)` puts the previous sale's amount on the current row, which makes month-over-month deltas a subtraction instead of a join. `LEAD` looks the opposite way. The first row in a partition has nothing behind it, so `LAG` returns `NULL` there unless you ask for a fallback with `LAG(amount, 1, 0)`. Under the hood this is why window functions feel magical compared to the pre-2011 way: getting "previous row" used to mean a self-join with a correlated subquery hunting for the max smaller date — O(n²)-ish pain that these functions make linear-ish.

Finally, the **filter-on-top-of-windows pattern**, which is the single most common practical use: top-N per group. The need is "latest order per customer" or "top 3 per category." SQL's execution pipeline runs `WHERE` long before window functions are computed, so you cannot write `WHERE ROW_NUMBER() OVER (...) <= 3` — Postgres rejects it outright. Some databases added a dedicated clause for this (Snowflake and Teradata have `QUALIFY`); PostgreSQL deliberately hasn't. The universal workaround is to compute the window in an inner layer and filter outside it: put `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn` in a CTE, then `WHERE rn = 1` in the outer query. For the special case of greatest-per-group there's also an aggregate-flavored option — comparing each row against `(group, MAX(value))` pairs using `= ANY (SELECT ...)`, which returns every row tied with the group maximum — and Postgres' own `DISTINCT ON` shortcut, which keeps the first row per group given a suitable sort.

What do you pay for all this? Ordering. Almost every window function needs its input sorted by `(partition columns, order columns)`, and if no index already provides that shape, Postgres performs the sort itself — on millions of rows that's memory and time, sometimes spilling to disk. An index matching the window's `(PARTITION BY ..., ORDER BY ...)` prefix can let the planner skip the sort entirely, and `EXPLAIN ANALYZE` will tell you whether it did ([what is EXPLAIN ANALYZE](./what-is-explain-analyze.md)). The second cost is size: unlike `GROUP BY`, output rows equal input rows, so a windowed query over ten million rows ships ten million rows toward whoever consumes it. Use windows when you genuinely need the detail rows annotated; when you only need per-group numbers, plain `GROUP BY` is cheaper and smaller. Correctness-wise there's nothing transactional to fear — a window function is deterministic given fully specified ordering, and it neither locks nor modifies anything it looks at.

## 4. See It In Practice — Real Code or Queries

All queries below are PostgreSQL syntax. Sample data first, so every example is runnable end to end:

```sql
CREATE TABLE sales (
    id        bigserial PRIMARY KEY,
    seller_id bigint        NOT NULL,
    region    text          NOT NULL,
    amount    numeric(10,2) NOT NULL,
    sold_on   date          NOT NULL
);

INSERT INTO sales (seller_id, region, amount, sold_on) VALUES
    (1, 'north', 700.00, DATE '2024-03-11'),
    (2, 'north', 700.00, DATE '2024-03-07'),
    (3, 'north', 500.00, DATE '2024-03-09'),
    (4, 'south', 650.00, DATE '2024-03-05'),
    (5, 'south', 300.00, DATE '2024-03-06');
```

**Ranking with ties — the three functions side by side.** Sellers 1 and 2 tie at 700, so watch the north region:

```sql
SELECT
    seller_id,
    region,
    amount,
    ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) AS rn,
    RANK()       OVER (PARTITION BY region ORDER BY amount DESC) AS rnk,
    DENSE_RANK() OVER (PARTITION BY region ORDER BY amount DESC) AS drank
FROM sales;
```

For north you get: seller 1 → rn 1, rnk 1, drank 1; seller 2 → rn 2 (arbitrary — could have been swapped), rnk 1, drank 1; seller 3 → rn 3, rnk 3 (rank skipped 2 because two rows tied at 1), drank 2 (dense rank never skips).

**Running totals — and the exact trap the default frame sets.** Watch what happens when a seller has two sales on the same date:

```sql
WITH daily AS (
    SELECT * FROM (VALUES
        (DATE '2024-06-01', 100),
        (DATE '2024-06-02', 50),
        (DATE '2024-06-02', 30)
    ) AS t(sold_on, amount)
)
SELECT
    sold_on,
    amount,
    -- default frame: RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    -- peers (same sold_on) are included together
    SUM(amount) OVER (ORDER BY sold_on) AS range_total,
    -- explicit frame: strictly row by row
    SUM(amount) OVER (ORDER BY sold_on
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS rows_total
FROM daily;
```

Results, in order: 100 / 100, then 50 / 180, then 30 / 180. The `range_total` column jumps to 180 on the middle row because its date-tied peer got pulled in; `rows_total` accumulates one physical row at a time. In finance reports, that difference silently changes totals — decide deliberately which one you mean.

**Previous-value comparison without a self-join.** Month-over-month style delta using `LAG`:

```sql
SELECT
    seller_id,
    sold_on,
    amount,
    LAG(amount) OVER (PARTITION BY seller_id ORDER BY sold_on) AS prev_amount
FROM sales;
```

Seller 1's first row gets `NULL` in `prev_amount` — there's nothing before it in its partition. If downstream code can't handle nulls, ask for a default: `LAG(amount, 1, 0) OVER (...)`.

**Top 3 sellers per region.** The pattern that shows up in a third of all reporting work:

```sql
WITH ranked AS (
    SELECT
        region,
        seller_id,
        amount,
        ROW_NUMBER() OVER (
            PARTITION BY region
            ORDER BY amount DESC, sold_on  -- sold_on breaks ties deterministically
        ) AS rn
    FROM sales
)
SELECT region, seller_id, amount
FROM ranked
WHERE rn <= 3;
```

Two senior touches worth copying. First, the tiebreaker: ordering only by `amount DESC` leaves the 700-vs-700 pair in arbitrary order, which makes dashboards flicker between renders and makes pagination show duplicates. Adding `sold_on` (or `id`) makes the numbering stable. Second, the shape: the window is computed inside the CTE and filtered outside it, because `WHERE rn <= 3` cannot live in the same query level where `rn` is produced.

**Greatest per group, aggregate flavor.** When you want "the biggest sale in each region" and you accept all ties being returned, you can skip window functions entirely and compare each row against the group maxima:

```sql
SELECT seller_id, region, amount
FROM sales s
WHERE (s.region, s.amount) = ANY (
    SELECT region, MAX(amount)
    FROM sales
    GROUP BY region
);
```

This returns both 700-row north sellers, because both tie at the region maximum. Whether that's a feature or a bug depends on the requirement — which is exactly the kind of distinction interviewers listen for.

**Postgres shortcut for one-row-per-group.** `DISTINCT ON` keeps the first row of each group under a matching sort:

```sql
SELECT DISTINCT ON (region) region, seller_id, amount, sold_on
FROM sales
ORDER BY region, amount DESC, sold_on;
```

Postgres-specific (portable code should prefer the CTE form), but unbeatable for quick "latest/latest-per-group" queries.

**Reusing a window definition.** Production queries often stack several window functions over the identical window; define it once:

```sql
SELECT
    seller_id,
    region,
    amount,
    RANK() OVER w AS rnk,
    AVG(amount) OVER w AS region_avg
FROM sales
WINDOW w AS (PARTITION BY region ORDER BY amount DESC);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a window function, and how is it different from GROUP BY?**

A window function computes a value for every row based on other rows in a defined "window" — typically its partition — without merging rows away. `GROUP BY` collapses each group into a single summary row, so after `GROUP BY region` the individual deals no longer exist in the result and you literally cannot rank them. A window function keeps every row and adds an annotation: each deal stays in the list, stamped with its rank, running total, or neighbors' values. They compose, too — a query can use `GROUP BY` aggregates and window functions together, and the window functions run after the grouping, so they can even reference grouped results. The one-line framing: `GROUP BY` changes the grain of the result; window functions keep the grain and decorate it.

**Q: What do PARTITION BY and ORDER BY do inside OVER()? Isn't ORDER BY already a thing?**

Inside `OVER()`, `PARTITION BY` splits the result set into independent groups that calculations restart within — rank goes back to 1 per partition — but it filters nothing and removes nothing; every row survives. The `ORDER BY` inside the window defines the processing order the function uses: rankings count along it, running sums accumulate along it, and offsets like `LAG` measure distance along it. That's a completely different job from the query's trailing `ORDER BY`, which only sorts the final output rows for presentation. You routinely use both in one query — an inner `ORDER BY amount DESC` to compute ranks, and an outer `ORDER BY region, rnk` to present them. And an empty `OVER()` is legal too: the whole result set becomes one partition, which is how you get grand-total-per-row comparisons like share of total.

**Q: Explain the difference between ROW_NUMBER, RANK, and DENSE_RANK with tied values.**

Take scores 90, 90, 85. `ROW_NUMBER` produces 1, 2, 3 — every row gets a unique number, and among ties the assignment is arbitrary unless the ordering includes a unique tiebreaker. `RANK` produces 1, 1, 3 — ties share a rank, then the counter jumps past the tied rows (two rows occupied places 1 and 2, so the next row is 3). `DENSE_RANK` produces 1, 1, 2 — ties share a rank and the sequence continues with no gaps. Choose by what the number means downstream: pagination and "exactly N rows" logic needs `ROW_NUMBER`; competition-style placements where ties should occupy the same position and the next position reflects how many people beat you needs `RANK`; bucketing into tiers or percentile bands where gaps would corrupt band boundaries needs `DENSE_RANK`.

**Q: I wrote SUM(amount) OVER (ORDER BY sale_date) expecting a running total, but numbers jump when two sales share a date. Why?**

Because you didn't declare a frame, so Postgres applied the default for windows with an `ORDER BY`: `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. `RANGE` treats rows equal on the ordering key — same `sale_date` — as peers, and the current row's aggregate includes all its peers at once. Both tied rows therefore display the combined total, and the running figure leaps by two rows' worth in one step. If you want strict row-by-row accumulation, name the frame explicitly with `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. The mental model: `RANGE` compares values, `ROWS` counts physical rows — and the default chose value-comparison for you. Bonus point in interviews: with no `ORDER BY` at all, the default frame is the entire partition, which is exactly why `AVG(x) OVER (PARTITION BY g)` yields the group average on every row rather than anything cumulative.

**Q: Can you filter on a window function directly in WHERE, like WHERE RANK(...) <= 3?**

No — Postgres raises `ERROR: window functions are not allowed in WHERE`. The reason is the logical evaluation order of a SELECT: `FROM` → `WHERE` → `GROUP BY` → `HAVING` → window functions (with the select list) → outer `ORDER BY` → `LIMIT`. `WHERE` runs before windows exist, so the rank simply isn't computed yet at filtering time — and conceptually, filtering first is what guarantees the window sees a well-defined input. The fix is layering: compute the window function in a CTE or subquery, then apply `WHERE rn <= 3` in the outer query. The same restriction explains why you also can't use window functions in `GROUP BY` or `HAVING`; they're allowed in the select list and the outer `ORDER BY` only.

**Q: How do you get the latest order per customer, or the top 3 products per category, in PostgreSQL?**

The portable answer: number the rows within each group and keep the winners. Wrap `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) AS rn` in a CTE, then select `WHERE rn = 1` (or `rn <= 3`) outside it. Include a unique tiebreaker in the ordering so two orders with the same timestamp don't produce flickering or duplicated picks. PostgreSQL has no `QUALIFY` clause — that convenience exists in Snowflake and Teradata — so the CTE layering is the standard workaround. Alternatives worth naming: for greatest-per-group, compare against aggregated pairs with `(customer_id, created_at) = ANY (SELECT customer_id, MAX(created_at) FROM orders GROUP BY customer_id)`, remembering that all tied rows come back; and for a single winner per group, Postgres' `DISTINCT ON (customer_id) ... ORDER BY customer_id, created_at DESC` is terse and fast. Know all three, because the follow-up question is always "when would each be better?" — `DISTINCT ON` is Postgres-only and picks one row; the `= ANY` form handles ties naturally; the window form extends cleanly to top-N and to carrying extra window stats.

**Q: What do LAG and LEAD do, and when would you reach for them?**

They read another row's column value relative to the current row, measured along the window's `ORDER BY` within the same partition. `LAG(amount)` puts the previous row's amount on the current row; `LEAD(amount)` grabs the following one; optional arguments control offset distance and the default when the neighbor doesn't exist (`LAG(amount, 1, 0)`). Before this existed, "previous value" meant a self-join driven by a correlated subquery finding the greatest earlier date — slow and miserable. Now month-over-month growth, session-to-session gap analysis, churn between consecutive events, and funnel drop-off are all one pass over ordered data. The edge to remember: boundary rows have no neighbor, so first-partition `LAG`s come back `NULL` — handle that explicitly rather than letting nulls flow into arithmetic.

**Q: What are the performance implications of window functions? When would you avoid them?**

The dominant cost is ordering: the input must be sorted by the window's `(PARTITION BY, ORDER BY)` combination, and on large tables that means either a sort node in the plan — potentially spilling to disk — or an existing index whose column order matches the window's needs, which lets the planner skip the sort. Check with `EXPLAIN ANALYZE` whether you're paying a Sort and whether it spilled. The second cost is volume: output cardinality equals input cardinality, so annotating ten million rows produces ten million rows to transfer and consume. Avoid windows when you only want per-group summaries — plain `GROUP BY` is smaller and cheaper — and when the annotated result would just be re-aggregated downstream anyway. Also watch stacking many different windows in one query: windows with incompatible orderings can force multiple sorts of the same data. None of this makes window functions exotic; it just means the same discipline as any query — look at the plan, match indexes to the access path.

## 6. The Traps — What Goes Wrong in Production

**Filtering on the window function in WHERE.** The wrong assumption: `WHERE ROW_NUMBER() OVER (PARTITION BY region ORDER BY amount DESC) <= 3` reads naturally, so it should work. It doesn't: `WHERE` executes before window functions are computed, so Postgres fails the query with `ERROR: window functions are not allowed in WHERE` — or worse, a developer "fixes" it by moving the logic somewhere that silently means something else. What actually happens if you try to fake it with a `HAVING` or mislayered filter is wrong rows or an error in front of a stakeholder. The fix is mechanical: compute `rn` in a CTE or subquery and filter `WHERE rn <= 3` one level up. Internalize the pipeline — `WHERE` → `GROUP BY` → `HAVING` → windows → `ORDER BY` — and this trap disappears permanently.

**Trusting the default frame for running totals.** The wrong assumption: `SUM(x) OVER (ORDER BY day)` accumulates row by row. Why it's wrong: the silent default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and `RANGE` folds all peers — rows sharing the ordering value — into the same step. What happens: every time two transactions land on the same day (which, at scale, is constantly), the running total double-jumps and reconciliation reports stop matching the ledger. Nobody notices in dev with seeded data at one-row-per-day; it surfaces in production where timestamps collide. Fix: write `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` explicitly whenever you mean physical-row accumulation — and conversely, choose `RANGE` deliberately when peers genuinely should share a step.

**ROW_NUMBER without a unique tiebreaker.** The wrong assumption: `ORDER BY amount DESC` fully determines row numbers. Why it's wrong: ties leave the numbering arbitrary — Postgres may order them differently across executions, especially after plan changes or parallelism differences. What happens: "top 10" pages randomly swap which tied item is #10 versus #11, users refreshing a dashboard see items appear and vanish, and keyset pagination skips or duplicates rows. Fix: always append a unique column — `ORDER BY amount DESC, id` — so the ranking is a total order. Interviewers probe this constantly because it separates people who've been burned by flaky leaderboards from people who've only seen toy data.

**Believing PARTITION BY filters or shrinks rows.** The wrong assumption: coming from `GROUP BY`, developers expect `PARTITION BY region` to yield roughly one row per region. Why it's wrong: partitioning only draws neighborhood boundaries for the calculation — it never removes rows. What happens: someone "optimizes" a huge export by adding `PARTITION BY` and discovers the result is just as huge, or assumes a partition acts as a filter and ships unfiltered data to a client that expected only some regions. Fix: remember the grain rule — windows preserve input grain exactly; the only things that reduce rows are `WHERE`, `GROUP BY`, `DISTINCT`, or an outer filter on the windowed layer.

**Using window functions where GROUP BY was the right tool.** The wrong assumption: window functions are the newer, fancier thing, so they're the better default. Why it's wrong: windows force a sort of the full working set and return one output row per input row, so "average order per region" done with `AVG(amount) OVER (PARTITION BY region)` scans, sorts, and ships vastly more work than the equivalent `GROUP BY` — and then the app usually deduplicates regions anyway. What happens: a reporting endpoint that was fine at 10k rows starts timing out at 2M, and the plan shows a giant Sort feeding a nearly-unused result. Fix: ask one question before writing either — "do I need the individual rows?" Yes → window. No → `GROUP BY`. When the diagnosis is unclear, the workflow on [how do you optimize slow PostgreSQL queries](./how-do-you-optimize-slow-postgresql-queries.md) applies unchanged: read the plan, find the sort, question the grain.

## 7. Compare With Related Concepts

**Window functions vs GROUP BY.** The central comparison. `GROUP BY` reduces every group to one row and loses the members; a window function keeps every member and computes group-aware values per member. Rule: if the answer's grain is "one row per group," use `GROUP BY`; if the grain is "every original row, decorated with group context," use a window function.

**Window functions vs self-joins / correlated subqueries.** "Previous row" or "compare against group max" pre-window style requires joining the table to itself via a max-or-greatest-so-far subquery, which degrades badly as tables grow. Rule: on modern Postgres, express neighbor-and-rank questions as windows; reach for joins only when combining genuinely different tables, not neighboring rows of the same one.

**Top-N-per-group via windows vs DISTINCT ON.** Both solve "one interesting row per group." `DISTINCT ON` is terse and Postgres-native but limited to picking the single first row per group and is non-portable; the window form generalizes to top-N, ties, and extra per-group stats, and travels across databases. Rule: quick single-winner query in a Postgres-only codebase, `DISTINCT ON`; anything needing N > 1, tie handling, or portability, `ROW_NUMBER` in a CTE.

**Window ORDER BY vs query ORDER BY.** Same words, different jobs. The window's `ORDER BY` feeds the computation (what "previous," "first," "running" mean); the query's trailing `ORDER BY` sorts final output for humans. Rule: whenever a result looks correctly calculated but wrongly sorted — or vice versa — check which `ORDER BY` you changed.

**LIMIT vs top-N-per-group.** `LIMIT` truncates the whole result set after everything else is done — it cannot give "top 3 within each region." Rule: `LIMIT` caps global rows; per-group caps require a window rank filtered in an outer layer (or `DISTINCT ON` for the single-row case).

If you want the layering technique used throughout the fixes here — CTEs wrapping window computations — that's covered properly on [what are CTEs](./what-are-ctes.md), and the index-ordering interplay mentioned in the performance discussion builds directly on [what is a B-tree index](./what-is-b-tree-index.md).

## 8. 🧠 The Memory Hook

`GROUP BY` is the secretary who melts every class into one summary card; a window function is the invigilator who walks the exam hall and stamps each student's paper with facts about their section — nobody leaves, everyone learns where they stand. `OVER()` opens the window: `PARTITION BY` picks the neighborhood, `ORDER BY` fixes the reading direction, the frame says how far to peek — and when you must act on the stamp, wait a layer and filter the CTE above it.
