# What Is a Query Execution Plan

## 1. The Real-World Problem — When You Actually Hit This

The same query, character-for-character identical, returns in 40ms in staging and takes 9 seconds in production. You diff the code — no changes. You diff the query — no changes. Someone suggests restarting the database. Nobody can answer the only question that matters: *what is the database actually doing differently?*

Here's the uncomfortable truth behind that mystery: the database never runs your SQL the way you wrote it. Your query is a description of the result you want, not instructions for getting it. Between receiving your query and returning rows, the database quietly makes dozens of decisions — which table to read first, whether to walk an index or read everything, in which order to combine tables, when to sort. That set of decisions is called the **query execution plan**, and it is almost always the real reason one environment is fast and another is slow. Staging had 50,000 rows and the planner picked an index lookup. Production has 40 million skewed ones and the same planner picked something else entirely. Same words in, completely different work out.

If you've ever added an index and watched performance stay exactly the same, or watched a fast query turn slow overnight with zero deploys, you were seeing a plan change without knowing plans existed. This page teaches you what a plan is, where its decisions come from, and why they go wrong — so "the query got slow" stops being a mystery and becomes something you can actually inspect.

## 2. The Analogy — Make the Mechanic Obvious

Think about a busy restaurant kitchen at 7pm. A waiter clips an order ticket to the rail: "one pad thai, extra spicy, no peanuts." That ticket doesn't tell anyone *how* to cook it. The head chef reads it and writes a prep plan before anything touches a pan: pull the noodles first because they need to soak, start the sauce base while the wok heats, garnish last. The ticket says *what* the customer wants. The prep plan says *how* the kitchen will produce it.

That's the relationship between your SQL query and the execution plan. And every other piece of the kitchen maps too:

- **The order ticket** is your **SQL query** — declarative, states the outcome, silent on method.
- **The head chef** is the **planner** (also called the optimizer) — the component whose entire job is turning "what" into "how."
- **The prep plan** is the **execution plan** — an ordered list of steps, each step naming its source and its action.
- **Grabbing ingredients from the labeled shelf next to the stove** versus **searching every aisle of the storeroom** is an **index seek versus a full table scan** — same ingredient either way, wildly different effort.
- **The order components get combined** — sauce reduced before noodles go in — mirrors the **join order**: which tables feed into which, in what sequence.
- **The chef's mental math** — "this step takes ten minutes, this recipe feeds four portions" — is the plan's **estimated cost and estimated rows** at each step.
- And all of that math runs off the **reservations book** — how many covers tonight, what people usually order. The reservations book is the database's **statistics**.

Now watch two failure modes appear in the kitchen before you ever see them in production. First: the reservations book was last updated a week ago and says Tuesday is quiet — forty covers planned — but three hundred people walk in. The *plan itself* falls apart mid-service: not enough rice par-cooked, two burners staffed when eight were needed. Nothing was wrong with anyone's cooking skill; the plan was built on stale numbers. That's a stale-statistics plan, and it's the most common way good queries go bad. Second: the chef preps the whole night based on the *first* pad thai ordered — a small table, two portions — and keeps that rhythm even when a party of twenty orders pad thai at 9pm. The plan was tuned for the first parameters it saw and reused blindly for very different ones. Databases do exactly this, and it has a name: parameter sniffing. Hold both images — stale bookings and first-order tuning — because together they explain most of the interview questions on this topic.

## 3. The Full Explanation — How It Actually Works

Start with the core mechanic. When a query arrives, the planner doesn't run it — it *designs* it. Roughly speaking: it parses the query, enumerates candidate strategies (for each table: full scan or some index; for joins: which pair combines first, then where the third table attaches, and with which algorithm), prices every candidate using statistics, and hands the cheapest one to the executor. The executor then follows that recipe literally, step by step, without re-deciding anything. The plan is the contract between thinking and doing.

Every plan, in every relational engine, answers the same four questions. Learn these and any vendor's output format becomes decoration:

1. **Access method per table** — full scan, index seek, index range scan, or index-only scan (everything the query needs was already in the index, so the table itself is never touched).
2. **Join order and join algorithm** — which tables combine first, and how: nested loop (probe the inner side once per outer row — brilliant when few rows match), hash join (build an in-memory hash of one side, probe it once — the choice for large unordered sets), or merge join (both sides sorted, zipped through together).
3. **Estimated rows flowing between steps** — the planner's guess of how many rows each operation produces, which drives every downstream decision, including the join order itself.
4. **Estimated cost** — an abstract number summing up I/O and CPU effort per step, used only to compare candidate plans against each other.

Where do those estimates come from? Statistics — and this is the single most load-bearing idea on this page. The database periodically summarizes each table: total row count, how many distinct values each column has, and histograms showing how values spread across ranges. From these summaries it predicts things like "customer_id = 42 will match roughly 12 rows." Notice the word *predict*. While planning, the planner does not look at your actual data — checking every value would be exactly the expensive thing everyone is trying to avoid. It navigates by summary, the chef navigating by the reservations book instead of interviewing every guest at the door.

Which explains how plans go bad, in two distinct ways.

**Stale statistics.** Statistics only refresh when something refreshes them — `ANALYZE` in PostgreSQL (also runnable as `ANALYZE TABLE` in MySQL), autovacuum's auto-analyze in PostgreSQL, auto-update-statistics in SQL Server. A massive bulk import, a migration backfill, or months of skewed growth can leave the summaries badly wrong. The planner then confidently estimates "3 rows," builds a plan shaped for 3 rows — nested loop, tiny memory grants — and the executor discovers 400,000. Every choice made downstream of that estimate was fiction. Classic symptom: a query that degraded after a big data change, with no code anywhere near it.

**Parameter sniffing.** Most applications send parameterized queries (`WHERE customer_id = ?`), and engines often compile a plan *once* for the first concrete values they see, then reuse it for subsequent calls. If the first execution had `customer_id = 42` matching five rows, the compiled plan is a nimble nested-loop index seek — perfect for five rows, terrible when a later call passes a customer with two million orders and gets served that same cached plan. PostgreSQL softens this by switching from custom plans to generic plans after a handful of executions; SQL Server is famous for sniffing pathologies and offers escapes like `OPTION (RECOMPILE)`. The deep point: caching plans trades adaptivity for CPU savings, and wildly varying input distributions break that trade. It's a design tension to manage, not a bug you can delete.

Now, reading plans. The *content* is universal; the *shape* differs by engine, and interviews love asking about this distinction:

- **PostgreSQL** prints a tree of plan nodes, indented so each node sits under the node that consumes its output. Read it inside-out — deepest lines first — because inner nodes execute first and feed their rows outward. Nodes are physical operations: `Seq Scan`, `Index Scan`, `Index Only Scan`, `Nested Loop`, `Hash Join`, `Sort`. Each carries `cost=startup..total` (abstract units), `rows=` estimate, and average row width.
- **MySQL** prints a flat table, one row per table in the query, with named columns. Read `type` first: `ALL` means full scan (worst), `range` is an index range scan, `ref` a non-unique index lookup, `eq_ref`/`const` primary-key-style lookups (best). Then `key` (which index was chosen — `NULL` means none) and `rows` (the estimate). The `Extra` column confesses hidden work: `Using filesort` means an extra sorting pass beyond index order, `Using temporary` means a temp table gets built.
- **SQLite** prints short plain-English lines from `EXPLAIN QUERY PLAN`: `SCAN t` means full scan, `SEARCH t USING INDEX ...` means an index seek, plus notes like `USE TEMP B-TREE FOR ORDER BY`.

Those are just shapes. The dedicated pages teach the tools themselves — [what EXPLAIN is](what-is-explain.md), [what EXPLAIN ANALYZE adds](what-is-explain-analyze.md), [PostgreSQL's EXPLAIN ANALYZE specifics](../postgresql/what-is-explain-analyze.md), and [MySQL's EXPLAIN fields](../mysql/what-is-explain-in-mysql.md) — so learn the concept here and the syntax there.

One more idea ties everything together: a plan is only as honest as its estimates, and plain `EXPLAIN` shows you only estimates. Comparing estimated rows against actual rows is how you catch stale statistics and bad guesses — precisely what [EXPLAIN ANALYZE](what-is-explain-analyze.md) reports. When a query misbehaves, that estimate-versus-reality gap is usually the smoking gun. The full diagnostic loop lives in [how to debug a slow query](how-do-you-debug-a-slow-query.md); this page gives you the vocabulary that loop depends on.

Finally, the trade-offs, because plans sit inside a real system. Better plans come from indexes and fresh statistics, but every index taxes every write ([indexes can hurt](when-can-indexes-hurt-performance.md)), and refreshing statistics costs a pass over the data. Plans themselves are nearly free to produce — milliseconds, no locks taken, no rows read — which is why inspecting them is safe even in production and should always be your first move, before touching any index.

## 4. See It In Practice — Real Code or Queries

First SQLite, because you can run this yourself right now with `sqlite3 :memory:` — the following transcript is verified output, not invented:

```sql
-- SQLite. Run line by line in `sqlite3 :memory:`

CREATE TABLE customers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- Only ONE index exists. Note what's missing: nothing indexes status.
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
```

```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE status = 'shipped';
```

```txt
QUERY PLAN
`--SCAN orders
```

Filtering on `status`, which has no index: `SCAN` means SQLite will read the entire table and test every row. No shortcut exists, because the planner knows — from the schema, not the data — that no structure helps here.

```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42;
```

```txt
QUERY PLAN
`--SEARCH orders USING INDEX idx_orders_customer_id (customer_id=?)
```

One word changed — `SCAN` became `SEARCH` — and the meaning changed completely: jump straight to the matching rows through the index. This SCAN-versus-SEARCH contrast is the fastest demonstration of what a plan is that exists anywhere; keep it in your pocket for interviews.

Plans also expose join order and hidden work:

```sql
EXPLAIN QUERY PLAN
SELECT c.name, o.id
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE o.created_at > '2026-01-01';
```

```txt
QUERY PLAN
|--SCAN o
`--SEARCH c USING INTEGER PRIMARY KEY (rowid=?)
```

Read top to bottom: scan all of `o`, and for each surviving row seek `c` by primary key. You never told the database which table to treat as outer — the planner chose `orders` as the driving table (it holds the filter) and `customers` as the inner probe. That's join order made visible. Hidden work shows up the same way:

```sql
CREATE INDEX idx_orders_customer_status ON orders(customer_id, status);

EXPLAIN QUERY PLAN
SELECT id, status FROM orders
WHERE customer_id = 42 AND status = 'shipped'
ORDER BY created_at DESC;
```

```txt
QUERY PLAN
|--SEARCH orders USING INDEX idx_orders_customer_status (customer_id=? AND status=?)
`--USE TEMP B-TREE FOR ORDER BY
```

Two steps: seek via the composite index, then build a temporary b-tree purely to satisfy the sort — machinery your SQL never mentioned. That's the real value of reading plans: they show the work your query *implies* but never states.

For scale, here's the same kind of story in the other two dialects. These output shapes are labeled representative examples — the dedicated pages cover their fields exhaustively. PostgreSQL prints the tree, read inside-out:

```txt
Sort  (cost=8.31..8.33 rows=12 width=36)
  Sort Key: o.created_at DESC
  ->  Nested Loop  (cost=0.29..8.10 rows=12 width=36)
        ->  Index Scan using idx_orders_customer_id on orders o
              (cost=0.29..4.43 rows=12 width=24)
              Index Cond: (customer_id = 42)
        ->  Index Scan using customers_pkey on customers c
              (cost=0.15..0.30 rows=1 width=20)
              Index Cond: (id = 42)
```

Same decisions, richer vocabulary: an index scan feeding a nested loop producing an estimated 12 rows, topped by a sort node. The innermost `Index Scan` executes first, and its `rows=12` estimate propagates upward into every decision above it.

MySQL prints the tabular form:

```txt
+----+-------------+-------+-------+------------------------+------------------------+---------+-------+------+-------+
| id | select_type | table | type  | possible_keys          | key                    | key_len | ref   | rows | Extra |
+----+-------------+-------+-------+------------------------+------------------------+---------+-------+------+-------+
|  1 | SIMPLE      | c     | const | PRIMARY                | PRIMARY                | 4       | const |    1 |       |
|  1 | SIMPLE      | o     | ref   | idx_orders_customer_id | idx_orders_customer_id | 4       | const |   12 | NULL  |
+----+-------------+-------+-------+------------------------+------------------------+---------+-------+------+-------+
```

Read top to bottom and watch `type`: `const` is a primary-key hit, `ref` is an index lookup with ~12 rows expected. Had either said `ALL`, a full table scan would be staring back at you.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a query execution plan?**

It's the database's internal strategy for executing a specific query — the concrete sequence of operations it will perform to produce the result. Because SQL is declarative, your query states *what* you want, and something has to decide *how* to get it: which access method per table (full scan vs index seek vs index-only scan), which order to join tables and with which algorithm, where to sort or aggregate, what temporary structures are needed. The planner produces that recipe before execution starts — enumerating candidates, pricing them against statistics, picking the cheapest — and the executor runs it literally. The insight to add right after that definition: two environments running byte-identical SQL can execute genuinely different plans, because the plan depends on the data's volume and distribution, not just on the query text.

**Q: Why can the exact same query be fast in staging and painfully slow in production?**

Because plans are derived from statistics, and the statistics differ between the environments. Staging might hold 50,000 uniformly distributed rows; production holds 40 million skewed ones. Different estimates lead to different access methods, different join orders, different memory grants — sometimes a plan that spills sorts to disk instead of doing them in memory. And a full scan isn't even automatically wrong at production scale: when a predicate matches most of the table, reading it sequentially can genuinely beat hopping through an index in random order. On top of plan differences, production adds factors no plan shows: cold caches mean disk reads, concurrent transactions mean lock waits, connection pool saturation means queueing before the query even starts. The senior framing: the query text is constant; the work performed is variable; the plan is where that variability becomes visible.

**Q: What information does a plan actually contain?**

Four things, in every engine. Access method per table touched. Join order and join algorithm for multi-table queries — nested loop, hash join, merge join. Estimated rows flowing out of each step. Estimated cost per step, in abstract units used only for comparing candidate plans. Plans also surface auxiliary steps you never wrote explicitly — sort nodes, temp tables or b-trees, dedup passes. What they deliberately do not contain: actual timings, actual row counts, lock behavior, or wait events. Executing is what produces those, which is exactly the gap EXPLAIN ANALYZE exists to fill.

**Q: Where do the row counts and costs in a plan come from — and why are they sometimes wrong?**

From statistics: per-table summaries the database maintains — total row count, distinct-value counts per column, histograms of how values distribute across ranges. The planner combines these summaries to predict each step's output size and price each candidate plan. They go wrong when the summaries stop matching reality: a bulk import or backfill that ran without a statistics refresh, months of natural skew drift, or correlated columns the model treats as independent — filtering on both `city` and `zip` gets guessed as if they were unrelated, massively overestimating matches. One wrong estimate cascades because row estimates feed the join-order decision itself: a bad guess early poisons the whole tree beneath it. Fixes: refresh statistics (`ANALYZE` in PostgreSQL, `ANALYZE TABLE` in MySQL), and compare estimated versus actual rows with EXPLAIN ANALYZE to detect estimation failure directly.

**Q: What is parameter sniffing?**

When applications send parameterized queries, many engines compile a plan once — using the concrete values from the first execution ("sniffing" them) — then cache and reuse that plan for later calls with different values. If the first call matched five rows, the compiled nested-loop index seek is perfect for five rows and disastrous when a later call matches two million but reuses the same plan. Symptom: one piece of SQL, identical every time, fast for some inputs and inexplicably slow for others. Engines handle it differently — PostgreSQL tries custom plans for a few executions and switches to generic plans if custom plans don't clearly win; SQL Server offers `OPTION (RECOMPILE)` per statement or `OPTIMIZE FOR` hints. Application-side mitigations include splitting extreme cases into separate queries so each gets an appropriate cached plan. The underlying tension is always the same: plan caching saves CPU on compilation but freezes assumptions that varying data invalidates.

**Q: How do you read a plan, and does it differ between engines?**

The content is universal — access methods, join order and algorithms, estimated rows, estimated cost — but rendering differs sharply. PostgreSQL prints a tree of physical operator nodes (`Seq Scan`, `Index Scan`, `Nested Loop`, `Hash Join`, `Sort`) that you read inside-out, deepest node first, since inner nodes execute first and feed outward; every node carries `cost=startup..total`, a `rows=` estimate, and average row width. MySQL prints one flat row per table with named columns: check `type` first (`ALL` full scan worst, `eq_ref`/`const` best), then `key` (index chosen, `NULL` if none) and `rows`, with `Extra` flagging hidden work like `Using filesort`. SQLite prints terse lines — `SCAN t` versus `SEARCH t USING INDEX ...`, plus notes such as `USE TEMP B-TREE FOR ORDER BY`. Same story, three fonts.

**Q: What's the difference between EXPLAIN and EXPLAIN ANALYZE?**

`EXPLAIN` prints the plan the planner *intends* to use and executes nothing — no rows read, no locks, millisecond-cheap, safe to run against production any time. `EXPLAIN ANALYZE` prints the plan *and actually executes the query*, annotating every step with real timing and actual row counts next to the estimates. That comparison is the payoff: estimated 3 rows, actual 40,000 means stale statistics or estimation failure, and every decision built on that estimate is suspect. Two cautions worth stating: EXPLAIN ANALYZE pays the full execution cost of the query, and for write statements it really executes them (PostgreSQL wraps it in a transaction that rolls back, MySQL needs care). Also its measurements reflect your session's conditions — warm or cold cache, no competing load — which may differ from production's reality.

**Q: A query suddenly became slow and nobody deployed anything. Walk me through your thinking.**

Since the code didn't change, either the plan changed or the environment around the plan changed. Plan-side suspects: statistics went stale after a bulk import or organic growth crossed a selectivity threshold and the planner switched strategy; a nightly stats-refresh job flipped the plan overnight; autovacuum/auto-analyze ran and altered estimates. Environment-side suspects that plans cannot show: lock contention from some new long-running transaction, connection pool saturation adding queue time before execution, cold caches after a failover, or plain data growth making a once-acceptable plan unacceptable — deep pagination (`LIMIT 20 OFFSET 500000`) degrades exactly this way. My process: capture the actual SQL from slow-query logs or PostgreSQL's `pg_stat_statements`, run EXPLAIN ANALYZE against production-shaped data, compare estimated versus actual rows, form one hypothesis, change exactly one thing, then re-read the plan to prove the fix landed rather than assuming it did.

**Q: Why would the optimizer ignore an index that looks perfect?**

Several legitimate reasons, and naming them separates senior answers from junior ones. Selectivity: if the predicate matches a huge fraction of the table — `status = 'active'` on a table that's 90% active — sequential reading genuinely beats thousands of random index-to-table hops, so ignoring the index is correct. The index can't serve the predicate: wrapping the column in a function (`WHERE DATE(created_at) = ...`), a leading-wildcard `LIKE '%smith'`, or — in MySQL — an implicit type cast comparing a string column to a number all make the index unusable for seeking. Stale statistics can make a useful index look useless by misestimating match counts. Or a better plan existed: for tiny tables, scanning everything is cheaper than maintaining any index lookup. So the reflex shouldn't be "the optimizer is broken," it should be "let me read the plan and find out *which* of these reasons applies."

## 6. The Traps — What Goes Wrong in Production

**Trap: "The database executes my SQL the way I wrote it."**
Wrong assumption: SQL text equals execution steps. Reality: the planner rewrites freely — reordering joins, swapping predicates across tables, choosing indexes you didn't name. What happens: developers hand-tune a query based on how it reads top to bottom and fix nothing, because their mental model doesn't match the executed recipe. Fix: treat the plan, not the query text, as the source of truth for performance questions — read it before reasoning about any slow query.

**Trap: trusting estimated rows as facts.**
Wrong assumption: `rows=12` in the output means twelve rows will flow through that step. It's a prediction from statistical summaries, sampled and histogram-based. When estimates are badly off, everything downstream of them — join order, algorithm choice, memory allocation — was decided under false pretenses, and the plan can look "fine" while performing terribly. Fix: after any EXPLAIN on a suspicious query, run EXPLAIN ANALYZE and compare estimated versus actual rows step by step; a large gap is your diagnosis, and refreshing statistics is usually your cure.

**Trap: reading `cost=` as milliseconds.**
Wrong assumption: cost 1000 means one second, or any wall-clock unit at all. Cost is an abstract dimensionless score computed from engine-specific constants about I/O and CPU effort, meaningful only for comparing candidate plans within the same engine version. Comparing costs across engines, versions, or after config changes that alter those constants is meaningless. Fix: use cost only to answer "which plan does the planner think is cheaper"; measure real duration with timing, real bottlenecks with EXPLAIN ANALYZE.

**Trap: adding an index and assuming the planner must use it.**
Wrong assumption: index exists therefore index gets used. As covered above, low selectivity, functions wrapped around the column, leading wildcards, implicit casts, or stale statistics can all leave the index untouched — and now every write on the table pays the index tax for nothing. What actually happens in teams: someone adds an index, deploys, sees no improvement, concludes "indexes don't help us." Fix: create the index, then verify its name appears in the fresh plan; an unverified index is a hypothesis, not a fix.

**Trap: debugging production plans against development data.**
Wrong assumption: a plan observed on a dev-sized dataset tells you anything about production's plan. Plans depend on volume and distribution, so dev frequently shows an index seek where production runs a scan, or vice versa. What happens: the fix verified locally fails in production, credibility burns. Fix: reproduce with production-shaped data — realistic row counts and value distributions, even if synthetic — and ideally confirm with production's EXPLAIN (safe, since it executes nothing) before shipping the change.

**Trap: believing a good plan stays good.**
Wrong assumption: tune a query once and it's tuned forever. Statistics refreshes, data growth, engine upgrades, and new indexes can all silently flip a plan — usually for the better, occasionally for the worse. Teams get burned when a routine maintenance window changes plans and Monday morning p95 regresses with zero code diff. Fix: watch for plan regressions after bulk loads and upgrades; know how to pin or force a known-good plan temporarily (plan management features exist precisely for this), and treat sudden regressions-with-no-deploy as a plan-change investigation first.

## 7. Compare With Related Concepts

**Execution plan vs EXPLAIN.** The plan is the artifact — the database's chosen strategy. `EXPLAIN` is the command that asks the planner to print that strategy without executing it. People say "check the EXPLAIN" when they mean "inspect the plan"; the tool prints, the plan is what gets printed. Rule: reason about plans; use EXPLAIN merely to see them — [details here](what-is-explain.md).

**Execution plan vs statistics (ANALYZE).** The plan is the chosen route; statistics are the map data the route was drawn from. Fresh maps, sensible route; stale maps, confidently wrong route. That's why fixing a bad plan often means running `ANALYZE` rather than touching the query at all. Rule: bad estimates in the plan point backward to statistics as the first thing to refresh.

**Execution plan vs EXPLAIN ANALYZE output.** Plain EXPLAIN gives the intended plan with predictions; EXPLAIN ANALYZE gives the executed plan with reality attached — actual rows, actual time per node. Rule: EXPLAIN to preview safely anywhere, EXPLAIN ANALYZE to audit estimates where executing the query is acceptable ([comparison](what-is-explain-analyze.md)).

**Execution plan vs the slow query log.** The log tells you *which* queries hurt and how often — evidence of symptoms ranked by damage. The plan tells you *why* one specific query does the work it does. They're sequential stages of diagnosis, not alternatives. Rule: logs pick the patient, the plan delivers the diagnosis — the full sequence lives in [debugging a slow query](how-do-you-debug-a-slow-query.md).

## 8. 🧠 The Memory Hook

Your SQL is an order ticket, not a recipe — the head chef (planner) writes the prep list (plan) using last week's reservations book (statistics). When service falls apart mid-rush, you don't stare harder at the ticket; you ask the chef to show you the prep list, and you check whether the reservations book told the truth.
