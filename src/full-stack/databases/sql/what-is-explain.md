# What is EXPLAIN

## 1. The Real-World Problem — When You Actually Hit This

It's 4pm and the finance team's monthly report endpoint is timing out. The query behind it is nothing exotic — `SELECT * FROM orders WHERE customer_id = 42 ORDER BY created_at DESC` — and it was instant back when the table had ten thousand rows. Now it has forty million, someone added an index "for the customer lookups" a few months ago, and nobody knows whether that index is actually being used. You can't watch a database think. Running the query faster doesn't tell you anything either — you'd just be measuring symptoms. What you need is to ask the database one direct question: *"if I gave you this query right now, exactly how would you get the data?"*

That question is what `EXPLAIN` answers. Prefix any query with the word `EXPLAIN` and the database hands you its strategy — the steps it plans to take — without running the query at all. It's the difference between guessing whether the index helps and *seeing* the decision the planner made. Every serious performance conversation you'll have in an interview eventually lands on "what did EXPLAIN say?"

## 2. The Analogy — Make the Mechanic Obvious

Think about how a maps app works before a road trip. You type in "airport," and before your car moves an inch, the app shows you a route: take the highway, exit at junction 12, then two local roads — with an estimated time of 38 minutes. The app made all these decisions *before* driving, using stored information about the roads: which are highways, which are alleys, where traffic usually builds up. And sometimes the fastest route is counterintuitive — the app sends you on the long highway loop instead of the obvious shortcut through town, because its data says the shortcut is jammed at this hour.

Every part of that maps directly onto EXPLAIN:

- **The stored map data** is the database's **statistics** — summaries the planner keeps about each table: roughly how many rows exist, how many distinct values a column has, how values are spread out.
- **The possible routes** are the **access paths** — crawl every street (a full table scan) versus jump on the highway near your house (an index lookup).
- **The estimated travel time** is the **cost estimate** — an abstract number the planner computes for each candidate plan, and the estimated arrival count is the **estimated rows** figure.
- **The route it picks and shows you** is the **query execution plan** — the ordered steps the database intends to perform.
- **Showing you the preview before you drive** is exactly what EXPLAIN does: it runs the *planning*, not the *trip*. Zero fuel burned, zero distance covered.

And the counterintuitive-route part matters too: when the planner ignores your shiny index and takes the full-table "highway," it's often not broken — its map data says the shortcut leads somewhere useless. That idea comes back in the traps below.

One honest limit of the analogy: a maps app updates its traffic data almost continuously. A database's statistics only change when something refreshes them — so the planner can be navigating with last year's map unless someone runs `ANALYZE`. Hold that thought for the comparisons.

## 3. The Full Explanation — How It Actually Works

Here's the thing people miss: SQL is *declarative*. Your query says **what** you want — "orders for customer 42" — never **how** to fetch it. Something else has to invent the how: read the whole table and filter? Use an index? For a join of four tables, which pairs get combined first? That decision-maker is called the **planner** (or optimizer), and the recipe it produces is the **query execution plan** — [its own topic lives here](what-is-query-execution-plan.md). `EXPLAIN` simply asks the planner to print the plan instead of executing it.

So when you run `EXPLAIN SELECT ...`, three things happen and one crucial thing doesn't:

1. The planner parses your query and enumerates candidate strategies.
2. It consults the **statistics** to estimate, for each strategy, how many rows each step will touch and what that costs.
3. It picks the cheapest plan and prints it — access method per table, join order for multi-table queries, extra steps like sorting.
4. **The query never runs.** No rows are read, no locks taken, no results returned. That's why EXPLAIN is millisecond-cheap and safe to run against production.

What you get back varies by engine, but every flavor tells you the same core story: *steps, access types, join order, estimated rows, estimated cost.* The vocabulary differs:

**PostgreSQL** prints a tree of plan nodes — read it inside-out, deepest node first. Each node is one physical operation: `Seq Scan` (read the whole table), `Index Scan` (walk an index, fetch matching rows from the table), `Index Only Scan` (everything needed was in the index, table never touched), or bitmap combinations of those. Joins appear as nodes too: `Nested Loop`, `Hash Join`, `Merge Join`. Each node carries `cost=startup..total` (abstract units, not milliseconds), `rows=<estimate>`, and `width=<estimated average row bytes>`.

**MySQL** prints a flat table of rows, one per table involved, with named columns. The ones you'll actually read: `type` — the access type, and the single most important field. `ALL` means full table scan. `index` means scan the whole index. `range` means an index range scan. `ref` means a non-unique index lookup. `eq_ref`/`const` mean unique-index or primary-key lookups — the best cases. Then `possible_keys` (indexes the planner considered), `key` (the one it chose — `NULL` means none), `rows` (estimated rows examined), and `Extra`, where MySQL confesses the awkward parts: `Using filesort` means an extra sorting pass beyond the index order (despite the name, not necessarily touching disk), `Using temporary` means a temporary table gets built (common with `GROUP BY`/`DISTINCT`), and `Using index` is the good one — the index covered the whole query, no table visits.

**SQLite** offers `EXPLAIN QUERY PLAN`, which prints a short flat list of steps using refreshingly plain words: `SCAN orders` (whole table), `SEARCH orders USING INDEX idx_orders_customer (customer_id=?)` (index lookup), `USING COVERING INDEX` (table never touched), and `USE TEMP B-TREE FOR ORDER BY` (sort materialized). Plain `EXPLAIN` without `QUERY PLAN` dumps raw virtual-machine opcodes — interesting once, irrelevant for daily work; `EXPLAIN QUERY PLAN` is the one you use.

Now the load-bearing fact underneath all of this: **every number the planner shows you is an estimate derived from statistics**, not from your actual data. Postgres keeps histograms and most-common-value lists (refreshed by the `ANALYZE` command and by autovacuum's auto-analyze); MySQL keeps index cardinality summaries (refreshed by `ANALYZE TABLE`); SQLite only records statistics if you've ever run `ANALYZE` on the database — otherwise it navigates with built-in default guesses. When statistics are current, estimates are close enough to steer by. When they're stale — after a big bulk load, say — the planner confidently picks a terrible plan based on fiction. This is the root cause of a huge fraction of mysterious "it was fine yesterday" slowdowns.

Why trust the plan at all, then? Because the alternative — running the query and watching the clock — tells you *that* it's slow, never *why*. EXPLAIN gives you the causal chain: which step dominates, which index got ignored, which join order multiplied work. And when you need the estimates checked against reality, that's the job of [EXPLAIN ANALYZE](what-is-explain-analyze.md), which we'll separate cleanly in section 7.

## 4. See It In Practice — Real Code or Queries

First a fully runnable example — everything below was executed against SQLite 3 (`sqlite3 :memory:`), so the outputs are exact:

```sql
-- Schema: 2000 orders across 100 customers, an index on customer_id,
-- and statistics collected with ANALYZE (which populates sqlite_stat1).
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_orders_customer ON orders(customer_id);
-- ... insert 2000 rows ...
ANALYZE;

-- Query 1: filter on an indexed column.
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE customer_id = 42;
```

Output (SQLite):

```txt
`--SEARCH orders USING INDEX idx_orders_customer (customer_id=?)
```

`SEARCH` with our index named — the planner hops straight to customer 42's slice instead of reading 2,000 rows.

```sql
-- Query 2: filter on status, which has NO index.
EXPLAIN QUERY PLAN
SELECT * FROM orders WHERE status = 'pending';
```

Output (SQLite):

```txt
`--SCAN orders
```

No usable index, so the planner commits to reading the whole table — correctly, given the choices it has.

```sql
-- Query 3: sort by a column no index covers.
EXPLAIN QUERY PLAN
SELECT * FROM orders ORDER BY created_at LIMIT 20;
```

Output (SQLite):

```txt
|--SCAN orders
`--USE TEMP B-TREE FOR ORDER BY
```

Two steps: gather everything, then build a temporary sorted structure just to satisfy the `ORDER BY`. On forty million rows this is precisely the kind of hidden step that turns a 20-row answer into an eight-second wait — and it's invisible unless you look at the plan. Add an index on `created_at` and this line disappears, because the planner can walk rows already in the right order.

Same exercise in **MySQL 8** — output format differs, meaning identical. Representative shape of the columns you'd see:

```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
```

```txt
id | select_type | table  | type | possible_keys       | key                 | rows | Extra
1  | SIMPLE      | orders | ref  | idx_orders_customer | idx_orders_customer | 20   |
```

`type=ref` — indexed non-unique lookup, our index both considered and chosen. If the index didn't exist you'd see `type=ALL, key=NULL, rows≈2000`. Two Extra values worth learning on sight: `Using filesort` appears when MySQL must sort outside index order (that's query 3 above), and `Using index` appears when the index alone satisfies the query. Since MySQL 8.0.16 you can also ask for `EXPLAIN FORMAT=TREE` to get a Postgres-style tree instead of the classic table.

And **PostgreSQL 16**, same query, representative output:

```sql
EXPLAIN SELECT * FROM orders WHERE customer_id = 42;
```

```txt
Index Scan using idx_orders_customer on orders  (cost=0.29..8.31 rows=20 width=28)
  Index Cond: (customer_id = 42)
```

Read it as one sentence: "walk `idx_orders_customer` with condition `customer_id = 42`, expect about 20 rows, cost 0.29 to start and 8.31 total." Without the index the first line would read `Seq Scan on orders  (cost=0.00..35.50 rows=40 width=28)` with `Filter:` instead of `Index Cond:` — filtering applied while reading every row. Notice the workflow in every dialect is identical: run EXPLAIN, find the offending step, change one thing (usually an index — the mechanics are on the [indexing page](what-is-indexing.md)), re-run EXPLAIN, and confirm the plan actually changed. An unchanged plan means the fix didn't land, whatever the migration said.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is EXPLAIN and when would you reach for it?**

When a query is slow — or before you ship a query you suspect might become slow — EXPLAIN asks the planner to print the strategy it would use, without executing anything. You get the planned steps, which access method each table gets (full scan vs index lookup), the join order for multi-table queries, and estimated row counts and costs per step. Because the query doesn't run, it's cheap and safe on production-sized data. The moment to reach for it: any query whose latency you can't explain, and any new query joining large tables before it ships.

**Q: How do you check whether a query is actually using an index?**

Prefix it with EXPLAIN and look for your index's name in the plan. In Postgres you want `Index Scan using <name>` or `Index Only Scan` instead of `Seq Scan`. In MySQL you want `type` of `ref`/`range`/`eq_ref` and your index under `key` — `type=ALL` with `key=NULL` means full table scan, index untouched. In SQLite's `EXPLAIN QUERY PLAN` you want `SEARCH ... USING INDEX <name>` rather than `SCAN`. One caution: seeing the index named isn't automatically good news — an index scan that touches half the table can lose to a clean sequential scan. The plan tells you what happened; the timing tells you whether it helped.

**Q: In MySQL's EXPLAIN output, what's the difference between type ALL, range, and ref?**

They're grades of the `type` column — how many rows the step must wade through. `ALL` is the worst: full table scan, every row examined. `range` is a bounded index sweep — the planner walks an index between two endpoints, like `WHERE created_at > '2026-01-01'`, examining only the matching stretch. `ref` is sharper still: a non-unique index lookup where the number of matching entries is typically small — `WHERE customer_id = 42`. Above those sit `eq_ref` and `const` (unique-key and primary-key lookups, essentially one row). So the mental ladder is ALL → index → range → ref → eq_ref/const, each rung meaning dramatically fewer rows touched. If a hot query sits at `ALL` with a big `rows` estimate, that's your smoking gun.

**Q: What do "Using filesort" and "Using temporary" mean in MySQL's Extra column — and are they always bad?**

Neither is literally about files or temp tables on disk in the common case — they're algorithm flags. `Using filesort` means MySQL needs the rows in an order the chosen index doesn't provide, so it collects matching rows and runs a separate sort pass (in memory if they fit, spilling to disk if not). `Using temporary` means MySQL builds a temporary table to hold intermediate results, classically for `GROUP BY` or `DISTINCT`. Are they always bad? No — sorting twenty rows is nothing. They're bad when the `rows` estimate feeding into them is large, because then you're materializing and sorting a mountain on every request. The fix pattern: add an index whose column order matches the filter-then-sort pattern (`(customer_id, created_at)` kills both the filter cost and the filesort for customer-scoped, time-ordered queries), and confirm via EXPLAIN that the flags disappear.

**Q: In Postgres, when is a Seq Scan actually the right plan?**

More often than people assume, and saying so is a senior signal. Two textbook cases. First, selectivity: if `WHERE status = 'active'` matches 90% of the table, an index scan would bounce randomly between heap pages fetching almost every row — random I/O across the whole table beats one tidy sequential read, so the planner rightly picks `Seq Scan`. Second, size: for a lookup table of a few hundred rows sitting in a handful of pages, reading it all is cheaper than the overhead of an index descent. The planner makes these calls from statistics, and it's usually right. So the reflex "Seq Scan = bug" is wrong; the real question is whether a *large* table is being scanned for a *small* result set. If yes, investigate; if the table is small or the match is broad, the scan is the correct engineering choice.

**Q: Where do the row estimates in EXPLAIN come from, and what happens when they're wrong?**

From statistics — precomputed summaries about each table: row counts, distinct-value counts per column, value distributions (histograms and most-common-value lists in Postgres, cardinality estimates in MySQL). The planner plugs your predicates into those summaries and projects how many rows each step yields. Wrong estimates are poison because every downstream decision inherits them: a step guessed at "1 row" that actually returns 400,000 makes the planner pick nested loops where a hash join belonged, allocate a work buffer a thousand times too small, and choose a join order that multiplies work. The signature symptom is a plan that looks sensible but performs horribly, with EXPLAIN ANALYZE showing actuals wildly diverging from estimates. The fix is refreshing statistics — `ANALYZE` in Postgres, `ANALYZE TABLE` in MySQL — especially after bulk loads, then re-planning.

**Q: Is it safe to run EXPLAIN in production?**

Plain EXPLAIN, yes — that's one of its best properties. Planning touches no rows, takes no row locks, and returns no data; worst case it burns a few milliseconds of CPU on a complicated query. That safety is exactly why you can debug on a production replica where the data volume actually matches the problem, instead of a dev database where every plan is trivially "fine." Two boundaries to know: EXPLAIN ANALYZE is a different beast — it *executes* the statement, so it mutates data for writes and holds real locks (details on [the EXPLAIN ANALYZE page](what-is-explain-analyze.md)); and if you need plans for queries *already* running slowly in production, MySQL offers `EXPLAIN FOR CONNECTION <id>` and Postgres has the `auto_explain` module to capture plans of slow statements automatically — no re-running required.

## 6. The Traps — What Goes Wrong in Production

**Trusting the estimated rows blindly.** Wrong assumption: the `rows` number in the plan is what the query will return, so a plan showing `rows=1` must be efficient. Why it's wrong: that number is a statistical *guess*, computed from summaries that may be days old or sampled badly. What actually happens: a report query's plan estimates 1 matching row, so the planner picks a nested-loop join sized for 1 row — then reality delivers 300,000, memory grants overflow, and the query crawls for minutes. Nobody caught it because the static plan looked innocent. The fix: treat estimates as hypotheses. When a plan matters, check estimates against actuals with EXPLAIN ANALYZE, and if they diverge badly, refresh statistics (`ANALYZE` / `ANALYZE TABLE`) before blaming your schema.

**Panicking at every full scan.** Wrong assumption: `Seq Scan` / `type=ALL` appearing anywhere is a defect to eliminate. Why it's wrong: the planner compares real costs, not vibes — and for a 500-row table or a predicate matching 80% of rows, scanning genuinely wins. Forcing index usage there (optimizer hints, or dropping the scan's viability) produces a slower plan than the "ugly" one. What actually happens: teams burn hours chasing scans on lookup tables that complete in 2ms, while the actual 9-second offender — a scan on a 40-million-row table — goes unnoticed in the same output. The fix: judge scans by table size and matched fraction, and by measured latency, not by pattern-matching the scary word. A scan on a big table serving a small result is the emergency; everywhere else it's a design decision.

**Believing EXPLAIN executed your query.** Wrong assumption, in both directions. Some people think EXPLAIN runs the statement — so they avoid it on busy systems or expect to see results. Others assume the printed plan is guaranteed truth about what will happen at runtime. Neither holds. EXPLAIN neither executes nor guarantees: it's the planner's *current intention*, and intentions shift when statistics refresh, data grows, or session settings (like Postgres `work_mem`) differ. What actually happens: a plan validated on Monday silently changes on Thursday after a nightly stats job, and performance shifts with it. The fix: treat a captured plan as evidence about *that moment*; re-verify after data growth, migrations, or config changes, and lean on slow-query monitoring to catch plans drifting underneath you.

**Adding the index and never confirming the plan changed.** Wrong assumption: creating an index fixes queries that can use it, automatically, immediately. Why it's wrong: the planner only picks indexes it believes are cheaper, and several things quietly block the win — a wrapped column (`WHERE DATE(created_at) = ...`) that makes the index unusable, mismatched column order in a composite index, or statistics so thin the planner can't see the index's advantage. What actually happens: the migration deploys, everyone moves on, the endpoint stays slow for months because nobody re-ran EXPLAIN to notice the plan never mentioned the new index. The fix: make "re-run the plan and find the index's name in it" the mandatory last step of every indexing change — if the name isn't in the plan, the fix hasn't landed, and the [slow-query debugging loop](how-do-you-debug-a-slow-query.md) continues.

## 7. Compare With Related Concepts

**EXPLAIN vs EXPLAIN ANALYZE.** Same prefix, fundamentally different contracts. EXPLAIN is the route preview: pure planning, no execution, safe anywhere, but every number is an estimate. EXPLAIN ANALYZE is the driven trip: it *actually executes* the statement and annotates each plan step with real timings and real row counts next to the planner's estimates — which is how you catch the estimate-vs-reality divergence from the traps above. The price of that honesty is real execution: writes mutate data, locks get held, and you should think twice before pointing it at a destructive UPDATE on production. Rule: start with plain EXPLAIN because it's free and safe; escalate to EXPLAIN ANALYZE when the estimates could be lying and you need ground truth.

**EXPLAIN vs ANALYZE (the statistics command).** A cruel naming collision, because the words overlap but the jobs couldn't differ more. `EXPLAIN` *reads* the planner's chosen plan. `ANALYZE` (Postgres; `ANALYZE TABLE` in MySQL) *writes*: it samples the tables and refreshes the very statistics the planner depends on. They compose in that order: stale statistics produce garbage estimates, which produce bad plans, so when estimates look insane, you refresh stats with ANALYZE first, then re-run EXPLAIN to see whether the plan improves. Rule: EXPLAIN diagnoses the route, ANALYZE redraws the map.

**EXPLAIN vs the query execution plan.** Easy conflation since the terms travel together: EXPLAIN is the *command*, the execution plan is the *artifact* it prints. You'll also meet the plan without EXPLAIN — MySQL's `EXPLAIN FOR CONNECTION` and Postgres's `auto_explain` surface plans of live or finished queries. Rule: the plan is the diagnosis; EXPLAIN is just the stethoscope.

**EXPLAIN vs the slow query log.** Opposite directions of discovery. The slow query log is reactive — it tells you *which* queries hurt after users felt it; EXPLAIN is investigative — it tells you *why* a query hurts, before or after. Mature teams pair them: the log finds the suspects, EXPLAIN (then ANALYZE on a replica) convicts them. The full loop lives on the [debugging a slow query](how-do-you-debug-a-slow-query.md) page.

## 8. 🧠 The Memory Hook

EXPLAIN is the route preview before the drive: the planner studies its map (statistics), picks a path (scan or index, join order), and shows you the itinerary with estimated times — without turning the ignition. Estimates are only as good as the map, so when the plan lies, refresh the map (`ANALYZE`) — and when you need the trip log, not the preview, that's EXPLAIN ANALYZE.
