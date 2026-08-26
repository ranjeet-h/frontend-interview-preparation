# What Are CTEs (Common Table Expressions)

## 1. The Real-World Problem — When You Actually Hit This

It's late afternoon. A teammate pings you: "Can you make the revenue dashboard exclude trial accounts?" Sounds like a two-line change. Then you open the query behind it.

It's one SQL statement, 180 lines long, with a subquery nested inside a subquery nested inside another subquery. The "active paying customers" logic — the thing you need to modify — appears in three different places at three different nesting levels. You change one copy, miss the other two, and the dashboard quietly shows different numbers than yesterday. Nobody notices for a week.

This is the exact pain CTEs were invented for. Not performance, not features — readability and safe modification. A CTE lets you take each piece of that monster query, give it a name, define it once at the top, and refer to the name everywhere below. Same logic becomes a short, flat, ordered script instead of a Russian doll. And once your queries are readable, they open the door to things nested subqueries genuinely cannot do cleanly, like walking an org chart or a category tree.

## 2. The Analogy — Make the Mechanic Obvious

Think about doing your taxes at the kitchen table. The form keeps asking for "total freelance income" — in six different places. You could redo that arithmetic inside every box, but you'd go crazy and probably get six different answers. So instead, you scribble it once on a scratch pad: *"Freelance income = $42,000."* Now every box just says "use Freelance income." One calculation, one place to fix, one name to remember.

That scratch pad is exactly what a CTE is: a **named intermediate result** that exists for the duration of one query. The `WITH` clause is you writing the scratch pad at the top. Every reference below it is "use the number from the pad."

Two details of the analogy map perfectly onto real behavior. First, the pad gets thrown away when you finish the form — a CTE lives only for that single statement, unlike a table or a view. Second, there's a difference between *writing the subtotal down* and *doing the math again in your head each time someone asks*. Writing it down is **materializing** the CTE. Recomputing it on demand is **inlining** it. Which one Postgres chooses turns out to be a famous interview question — hold that thought.

Recursion fits the analogy too. Building your family tree: write your own name on a fresh sheet, then repeatedly add "every person whose child is already on the sheet," copying names across until a pass adds nothing new. Start, expand, stop — that's the whole mechanic.

## 3. The Full Explanation — How It Actually Works

In plain English: a CTE is a temporary, named result set that you define at the top of a query with the `WITH` keyword and use in the main query below. It doesn't live in the database. It isn't saved. It's scaffolding for exactly one statement.

**The basics.** `WITH name AS (SELECT ...)` followed by your main query. Inside the parentheses goes any valid `SELECT`. The main query treats the CTE exactly like a table: you can join to it, filter it, aggregate it. The payoff over a nested subquery is structural — the hard parts sit at the top, flat and labeled, and the main query reads like the last line of the story instead of the middle of a maze.

**Chaining.** You can define several CTEs in one `WITH`, separated by commas, and each one can reference the ones defined before it. This is the real superpower. `monthly_totals` feeds `customer_averages`, which feeds the final answer. Complex logic becomes a pipeline of small, individually testable steps — you can run any prefix of the pipeline by hand and inspect its output. Try doing that with four levels of nesting.

**Recursion.** Adding the `RECURSIVE` keyword lets a CTE reference *itself*, which is how SQL walks graphs and hierarchies — org charts, category trees, bill-of-materials, friend-of-friend chains. A recursive CTE always has two parts joined by `UNION ALL`: an *anchor* query (the starting row(s)) and a *recursive* query (rows derived from the previous round's rows). Postgres runs the anchor once, then loops: take only the rows produced in the last round, feed them into the recursive part, append whatever comes out, repeat. The loop ends when a round produces zero rows — so your recursive part must be written so it eventually produces nothing, usually because you run out of children to find.

**The materialization story — get the versions right, interviewers probe this.** Before PostgreSQL 12, every CTE was always written out to an internal temporary working table first. That made each CTE an *optimization fence*: the planner executed it standalone, and conditions from the outer query couldn't be pushed inside it, indexes on the base tables often went unused, and the whole result was computed even if the outer query needed one row. People lived with it, and sometimes even relied on it as a hint ("force this step to compute once").

PostgreSQL 12 changed the default. Since 12, a CTE is **inlined into the outer query like a subquery**, unless the planner can't or shouldn't — specifically, it stays materialized if it's `RECURSIVE`, has side effects (a data-modifying `DELETE`/`UPDATE`/`INSERT` inside), or is referenced more than once in the query. Inlined means predicates flow in, indexes get used, and there is no "computed once and cached" behavior at all. You control it explicitly with `WITH x AS MATERIALIZED (...)` to force the old compute-once fence, or `WITH x AS NOT MATERIALIZED (...)` to allow inlining even for a multiply-referenced CTE. Never guess — run the query through [EXPLAIN ANALYZE](what-is-explain-analyze.md) and look at whether the CTE shows up as its own node or disappears into the plan.

**Trade-offs.** What you gain: readability, reuse within one statement, a clean home for window-function results, and the ability to walk hierarchies. What you pay: a CTE is not a stored object, gives you no statistics of its own (the planner estimates from the underlying tables), and — depending on the version and materialization choice — can either hide useful predicates from the planner or recompute the same expensive subquery twice. Neither is free; choose deliberately.

**Where it connects to other machinery.** Two interactions matter most in interviews. First, window functions: you can't filter on a window function in `WHERE`, so the standard pattern is compute `ROW_NUMBER()` in a CTE, then filter on it in the outer query — see [window functions](what-are-window-functions.md) for that side. Second, data-modifying CTEs let one statement read rows it just deleted via `RETURNING`, giving you atomic move-and-archive operations without a transaction spanning two round trips.

## 4. See It In Practice — Real Code or Queries

The reporting-query rescue. Before: three copies of "active customers" scattered through nested subqueries. After:

```sql
-- Each CTE is one named, testable step. Run any of them standalone to debug.
WITH active_customers AS (
    -- Defined ONCE here. Every step below refers to this name,
    -- so changing the definition of "active" is a one-line edit.
    SELECT id, name, email, signup_date
    FROM customers
    WHERE status = 'active'
      AND signup_date < now() - interval '30 days'
),
monthly_revenue AS (
    -- References the CTE above like it's a real table.
    SELECT c.id,
           date_trunc('month', o.created_at) AS month,
           SUM(o.total_cents)                AS revenue_cents
    FROM active_customers c
    JOIN orders o ON o.customer_id = c.id
    GROUP BY c.id, date_trunc('month', o.created_at)
)
SELECT c.name,
       mr.month,
       mr.revenue_cents / 100.0 AS revenue
FROM monthly_revenue mr
JOIN active_customers c ON c.id = mr.id
ORDER BY c.name, mr.month;
```

Top-3 orders per customer — the classic "filter on a window function" shape that's impossible without a CTE or subquery wrapper:

```sql
WITH ranked_orders AS (
    SELECT id, customer_id, total_cents,
           ROW_NUMBER() OVER (
               PARTITION BY customer_id
               ORDER BY total_cents DESC
           ) AS rn
    FROM orders
)
SELECT id, customer_id, total_cents
FROM ranked_orders
WHERE rn <= 3;   -- WHERE can't hold ROW_NUMBER() directly; the CTE makes it possible
```

Walking an org chart with `RECURSIVE` — start at the CEO, collect the whole company, and guard against dirty cyclic data:

```sql
WITH RECURSIVE team AS (
    -- Anchor: runs exactly once. Everything starts from the root.
    SELECT id, name, manager_id, ARRAY[id] AS path
    FROM employees
    WHERE manager_id IS NULL

    UNION ALL

    -- Recursive part: everyone managed by someone found in the PREVIOUS round.
    -- The path check is the termination guarantee: if bad data ever creates a
    -- cycle (A manages B, B manages A), the cycle member is already in path,
    -- the WHERE fails, and recursion stops instead of spinning forever.
    SELECT e.id, e.name, e.manager_id, t.path || e.id
    FROM employees e
    JOIN team t ON e.manager_id = t.id
    WHERE NOT e.id = ANY(t.path)
       AND array_length(t.path, 1) < 20   -- belt-and-suspenders depth cap
)
SELECT * FROM team ORDER BY array_length(path, 1);
```

Atomic cleanup — delete and archive in one statement, one snapshot, no window where rows exist in neither place:

```sql
WITH finished AS (
    DELETE FROM jobs
    WHERE status = 'done'
      AND finished_at < now() - interval '90 days'
    RETURNING *              -- hand the deleted rows to the next step
)
INSERT INTO jobs_archive
SELECT * FROM finished;
```

And the explicit materialization controls, for when you actually care:

```sql
-- Force compute-once (pre-12 behavior): expensive step reused twice,
-- and we don't want the planner merging it in twice.
WITH stats AS MATERIALIZED (
    SELECT region, AVG(amount) AS avg_amount FROM sales GROUP BY region
)
SELECT s.*, st.avg_amount
FROM sales s JOIN stats st USING (region);

-- Allow inlining even though the CTE is referenced twice:
-- Postgres may substitute it everywhere and optimize straight through.
WITH vip AS NOT MATERIALIZED (
    SELECT id FROM customers WHERE tier = 'vip'
)
SELECT * FROM orders WHERE customer_id IN (SELECT id FROM vip);
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a CTE, and what problem does it actually solve?**

It's a named temporary result set defined with `WITH` at the top of a single SQL statement and consumed below it. The problem it solves is primarily readability and maintainability: deeply nested subqueries duplicate logic, hide the order of operations, and are dangerous to edit because the "same" condition in two nesting levels can mean different things. A CTE flattens that into a labeled pipeline of steps, each runnable and inspectable on its own. Secondarily it unlocks capabilities nested queries handle badly: multiple steps referencing earlier steps, recursive hierarchy walks, and a place to compute window functions before filtering them. The key boundary: a CTE exists only for that one statement — nothing is persisted.

**Q: Does a CTE always materialize? Is it cached?**

This is the version-sensitive question. Before PostgreSQL 12, yes — every CTE was always materialized into an internal temporary table, acting as an optimization fence: outer filters weren't pushed in, and the full result was computed regardless of what the outer query needed. From PostgreSQL 12 onward, the default flipped: a CTE is inlined into the outer query and optimized together with it, unless it's recursive, contains a data-modifying statement, or is referenced more than once — those cases still materialize. So on modern Postgres, a single-use plain `SELECT` CTE behaves like a subquery, not a cache. If you want compute-once semantics you say so explicitly: `AS MATERIALIZED` forces the fence, `AS NOT MATERIALIZED` permits inlining even for repeated references. The honest senior answer includes "and I verify with EXPLAIN ANALYZE rather than assuming."

**Q: Walk me through how a recursive CTE executes.**

There are two parts separated by `UNION ALL`: the anchor and the recursive term. Postgres runs the anchor once and puts its rows in a working set. Then it iterates: the recursive term runs against only the rows from the previous iteration (not everything accumulated so far), and its output is appended to the result. Repeat until an iteration returns zero rows — that's the normal termination. Concretely, for an org chart: the anchor grabs the CEO; round one finds the CEOs direct reports; round two finds their reports; and so on until it reaches employees who manage nobody, at which point a round adds nothing and the query finishes. Termination is your responsibility: if the data contains a cycle (two managers pointing at each other) and your recursive term has no guard, iterations never produce zero rows and the query runs away until it hits a statement timeout or exhausts memory. Guards are a depth cap (`WHERE depth < N`) or a visited-path check (`WHERE NOT new_id = ANY(path)`); PostgreSQL 14+ also offers the declarative `CYCLE` clause to do this for you.

**Q: When would you choose a CTE over a subquery?**

Default rule: prefer the CTE whenever the logic has named stages, when the same derived set is used more than once, or when recursion is involved — those are its home turf. Prefer a plain subquery when it's one small, self-contained condition, like a scalar lookup in a `WHERE` clause; dragging that into a CTE adds ceremony without clarity. Performance-wise they converge on modern Postgres since single-use CTEs inline anyway, so the decision is mostly about readability. The exception worth naming: if profiling shows a multiply-referenced expensive CTE being recomputed wastefully under `NOT MATERIALIZED`, or conversely a fence blocking predicate pushdown, flip the materialization setting explicitly and measure again.

**Q: Can you INSERT, UPDATE, or DELETE through a CTE?**

Yes — the `WITH` clause can contain data-modifying statements, each with a `RETURNING` clause whose output becomes a relation the main query consumes. The canonical use is an atomic move: `WITH moved AS (DELETE FROM jobs ... RETURNING *) INSERT INTO jobs_archive SELECT * FROM moved` deletes and archives in one statement, one snapshot. Two subtleties show seniority: all sub-statements execute against the same snapshot, so a later step cannot see rows an earlier step deleted except through `RETURNING`; and data-modifying CTEs are always materialized — the PG12 inlining change never applies to them, because side effects can't be reordered or duplicated by the optimizer. Also worth knowing: a data-modifying CTE fires exactly once per statement even if its output is joined in ways that look like repeats, which differs from how triggers fire per affected row.

**Q: Do CTEs hurt performance?**

Not inherently — but they remove a lever if you misunderstand them. On modern Postgres a single-use CTE is inlined, so it performs like the equivalent subquery. The real risks are: leaning on a CTE expecting "compute once" caching that doesn't happen (fix with `MATERIALIZED` if you truly want it), stacking many chained CTEs where the planner loses the ability to push selective filters down into an early stage — visible in EXPLAIN ANALYZE as a huge intermediate row count flowing into the next step — and heavy recursive CTEs that materialize the entire hierarchy in memory when the application only needed two levels. None of these are reasons to avoid CTEs; they're reasons to measure instead of assume.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: "The CTE caches its result, so it's faster."** The wrong assumption: defining something in a `WITH` makes Postgres compute it once and reuse the stored result. Why it's wrong: since PostgreSQL 12, single-reference, non-recursive, side-effect-free CTEs are inlined — the planner folds them into the outer query and may evaluate the underlying scan once per reference, with no working-table copy at all. What happens: a developer wraps an expensive aggregation in a CTE expecting savings, deploys, and the query plan (checked in EXPLAIN ANALYZE) shows the base tables scanned just as before, sometimes worse because the CTE's own estimate was off. The fix: decide deliberately. Reference the CTE more than once and it materializes naturally; otherwise write `AS MATERIALIZED` when you truly want compute-once, `AS NOT MATERIALIZED` when you want maximum optimizer freedom — and confirm with the actual plan, not folklore. This trap bites hardest in teams migrating an old pre-12 application, where tuning tricks built on the old guaranteed-materialization behavior silently change meaning after upgrade.

**Trap 2: Recursive CTE with no working termination check.** The wrong assumption: "my data is a tree, so walking it terminates." Why it's wrong: real tables are dirtied by bugs and imports — a `manager_id` loop (A reports to B, B reports to A), or a `parent_id` pointing at itself turns your tree into a graph with a cycle, and the recursive step keeps finding "one more employee" forever. What happens: the query spins, memory grows every iteration as the working set never empties, the connection pegs CPU, and you eat either a `statement_timeout` error or, with no timeout set, a database grinding under memory pressure affecting everyone else on the instance. The fix is layered: ensure the recursive term strictly shrinks the remaining problem, add a visited-set guard (`WHERE NOT next_id = ANY(path)`), cap depth as a safety net, and consider PostgreSQL 14+'s `CYCLE` clause. Test with a deliberately cyclic fixture row in CI — termination is a correctness property, not a performance nicety.

**Trap 3 (quick one): expecting a CTE to be visible outside its statement, or forward-referencing a later CTE.** A CTE dies the moment the statement ends — it's not a temp table, and the next query in the same transaction can't see it. And within one `WITH`, CTEs can only reference ones defined above them; `WITH b AS (...), a AS (SELECT FROM b ...)` fails because `b` doesn't exist yet at `a`'s definition point. Both mistakes come from treating the scratch pad as a stored object. Order your CTEs bottom-up (dependencies first) and reach for a real temp table when state must survive across statements.

## 7. Compare With Related Concepts

**CTE vs correlated/nested subquery.** Both produce intermediate results inside one statement. A subquery lives where it's used and reads inside-out; a CTE is declared up front, named, and reusable within the statement. On modern Postgres a single-use CTE and an equivalent subquery usually compile to the same plan. Rule: one small condition → subquery; named stages, reuse, recursion, or window-function filtering → CTE.

**CTE vs temporary table.** A temp table is a real (session-scoped) table: it persists across many statements, holds its own statistics, and can be indexed. A CTE vanishes when its statement ends and carries no statistics of its own. Rule: computing data once for one query → CTE; reusing the same working set across several statements in a session, or needing indexes/stats on it → temp table.

**CTE vs view.** A view is a saved, named query in the catalog, shareable across applications and sessions, with permissions attached. A CTE is private to the one statement that declares it. Rule: logic reused by many queries or needing access control → [view](what-are-database-views.md); structure for one specific query → CTE.

**CTE vs materialized view.** A materialized view physically stores its result and must be refreshed; a CTE computes fresh every time. Rule: expensive aggregate read many times more often than the underlying data changes → [materialized view](what-are-materialized-views.md); per-request intermediate logic → CTE.

## 8. 🧠 The Memory Hook

A CTE is a labeled scratch pad for one query: write the hard sums at the top, refer to the names below, throw the pad away when the statement ends. And the recursive version is a family-tree walk — start with the root, keep adding "children of whoever showed up last round," and always carry a guard so a loop in the data can't walk forever.
