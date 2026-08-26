# What is EXPLAIN ANALYZE

## 1. The Real-World Problem — When You Actually Hit This

Your dashboard has a query that's been getting slower for weeks. Yesterday it hit 9 seconds and someone opened a ticket. You run `EXPLAIN` on it and the plan looks *perfect*: it says `Index Scan using idx_orders_status`, cost 8.45, estimated rows: 1. Textbook. You show it to your lead, they nod, ticket closed.

Except the query still takes 9 seconds.

That gap between "the plan looked fine" and "it's still slow" is exactly the hole this tool exists to fill. Plain `EXPLAIN` only shows you the database's *guesses*. It never runs anything, so it can't tell you what really happened. The moment you re-run that query with `EXPLAIN ANALYZE`, you see the ugly truth hiding inside your pretty plan:

```txt
Index Scan using idx_orders_status on orders  (cost=0.43..8.45 rows=1)
                                             (actual time=0.036..2412.771 rows=1000000 loops=1)
```

The planner guessed **1 row**. Reality was **1,000,000**. Every other number in that plan was built on top of a fantasy. This is the single most common "why is my query slow when my plan looks good" answer in existence: the estimates and the actuals have diverged, and until you look at both side by side, you're debugging blindfolded.

## 2. The Analogy — Make the Mechanic Obvious

Think of a restaurant kitchen with a head chef who plans every dish from two things: a recipe book (the possible query plans) and an inventory sheet pinned to the wall (the table statistics).

The inventory sheet is key. It's not updated live. Someone walks around with a clipboard every so often and writes down "eggs: 12, tomatoes: 50." When an order comes in, the chef glances at the sheet and decides how to cook. Sheet says 12 eggs? Chef makes individual omelets, cracking one egg at a time. Sheet said 12 eggs but a delivery truck actually dumped 100,000 eggs this morning? The chef is still making omelets, one egg at a time, all night long.

Now the three tools in this topic map perfectly onto the kitchen:

- **`EXPLAIN`** is asking the chef, "how would you cook this?" He reads out his chosen recipe and his reasoning ("about 1 egg needed, quick job"). Nothing gets cooked. It's pure intention, built entirely off the possibly-stale sheet.
- **`EXPLAIN ANALYZE`** is standing behind the chef with a stopwatch while he actually cooks the dish. Now you get the recipe *and* the reality: how long each station took, how many eggs were actually cracked, how many times he repeated a step. If his sheet-based assumptions were garbage, you watch the disaster happen in real time — and you see exactly which station burned.
- **`ANALYZE`** (with no EXPLAIN in front of it) is sending someone around with the clipboard to recount the inventory. It cooks nothing and explains nothing. It just fixes the sheet.

Once you hold that picture, everything else on this page is just naming things: the chef is the query planner, the recipes are plan nodes, the inventory sheet is the statistics table, and the clipboard walk is the `ANALYZE` command refreshing those statistics.

## 3. The Full Explanation — How It Actually Works

When your SQL reaches the database, it first gets parsed, then a component called the **query planner** builds an execution plan — a tree of steps like "sequential scan," "index scan," "nested loop join." For every step, the planner writes down its *guesses*: how many rows this step will produce (`rows`) and how much effort it'll cost (`cost`). Those guesses don't come from looking at your data. They come from **statistics** — summary tables about each column: how many distinct values exist, which values are most common, how values are spread out. In PostgreSQL those summaries live in system catalogs and get refreshed by the `ANALYZE` command (autovacuum usually runs it automatically after enough rows change).

Plain `EXPLAIN` prints the plan tree with those guesses and stops. Zero execution, zero risk, zero truth.

`EXPLAIN ANALYZE` does everything `EXPLAIN` does, and then **actually executes the statement**, instrumenting every node of the tree as it goes. Each node reports back three things the estimate could never tell you: **actual time** (milliseconds from first to last row produced by that node), **actual rows** (what really came out), and **loops** (how many times that node ran — more on that below, because it's the number people misread most).

Two habits make the output readable. First, read it top-down but understand it bottom-up: indentation means nesting, and inner nodes finish before outer ones — data flows upward, so the slowest leaf usually deserves your attention first. Second, always compare `rows` (estimate) against `rows` (actual) on the important nodes. When they're close, the planner understands your data and you can trust the plan shape. When they differ by orders of magnitude — 1 estimated versus a million actual — the planner chose its whole strategy based on fiction, and that's usually where your seconds went.

Why does a bad row estimate wreck performance so completely? Because the row count drives every structural decision. Expecting 1 row, the planner picks a nested loop: "grab the one matching customer, probe their orders one at a time." Facing a million rows, that strategy means a million little index probes. The right move for a million rows is completely different — scan the table straight through, build a hash table, join in bulk. Same query, same schema, opposite plan, purely because of what the statistics claimed.

And here's the trap baked into the name: **`EXPLAIN ANALYZE` executes for real**. On a `SELECT`, that costs CPU and cache. On an `UPDATE` or `DELETE`, it *performs the write*. Triggers fire, rows change, locks get taken. The standard safety net is wrapping it in a transaction you roll back:

```sql
BEGIN;
EXPLAIN ANALYZE DELETE FROM sessions WHERE last_seen < now() - interval '90 days';
ROLLBACK;
```

One dialect footnote before we go further, because this trips people constantly: this behavior is PostgreSQL-specific vocabulary. **MySQL** got `EXPLAIN ANALYZE` in 8.0.18 and it also executes, printing an indented iterator tree with actual times — but it only accepts `SELECT` statements, so writes aren't even a question there. **SQLite has no `EXPLAIN ANALYZE` at all** — on sqlite 3.51 the parser rejects it outright. Its tools are `EXPLAIN QUERY PLAN` (shows the chosen plan, never executes) and plain `EXPLAIN` (dumps the low-level bytecode program). Always name the engine when you talk about this tool in an interview.

## 4. See It In Practice — Real Code or Queries

**PostgreSQL — watching a stale-statistics disaster happen**

*(PostgreSQL 15 syntax, outputs abridged; exact timings will differ on your machine.)*

Set the trap: teach the planner that `status` only ever holds one value, then dump a million rows of a different value behind its back.

```sql
CREATE TABLE orders (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id bigint NOT NULL,
  status      text   NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Phase 1: small table, one known value
INSERT INTO orders (customer_id, status)
SELECT g, 'pending' FROM generate_series(1, 10000) AS g;

CREATE INDEX idx_orders_status ON orders(status);
ANALYZE orders;  -- clipboard walk: stats now say status is 100% 'pending'

-- Phase 2: the delivery truck nobody counted
INSERT INTO orders (customer_id, status)
SELECT g, 'shipped' FROM generate_series(1, 1000000) AS g;
```

Now the query, with the planner still trusting yesterday's sheet:

```sql
EXPLAIN ANALYZE SELECT count(*) FROM orders WHERE status = 'shipped';
```

```txt
Aggregate  (cost=8.46..8.47 rows=1 width=8) (actual time=2655.102..2655.104 rows=1 loops=1)
  ->  Index Scan using idx_orders_status on orders
        (cost=0.43..8.45 rows=1 width=0) (actual time=0.036..2401.553 rows=1000000 loops=1)
        Index Cond: (status = 'shipped'::text)
Planning Time: 0.211 ms
Execution Time: 2655.388 ms
```

Read it like the kitchen: the sheet said "roughly 1 such order exists" (`rows=1`), so the chef picked the delicate tool — an index scan fetching rows one at a time. Actual: a million heap fetches, 2.65 seconds. The fix isn't an index hint. The fix is the clipboard:

```sql
ANALYZE orders;

EXPLAIN ANALYZE SELECT count(*) FROM orders WHERE status = 'shipped';
```

```txt
Finalize Aggregate  (cost=21442.19..21442.20 rows=1 width=8) (actual time=142.881..144.902 rows=1 loops=1)
  ->  Gather …
      ->  Parallel Seq Scan on orders  (cost=0.00..19360.00 rows=416667 width=0)
                                       (actual time=0.041..96.207 rows=333333 loops=3)
            Filter: (status = 'shipped'::text)
Planning Time: 0.184 ms
Execution Time: 146.112 ms
```

Fresh stats, honest estimate, sequential scan wins, 2.65s becomes ~0.15s. Twenty times faster, zero schema changes. That entire class of win is invisible to plain `EXPLAIN`.

*(If your machine splits the scan across parallel workers, you'll see `loops=3`-style numbers on the scan — the row counts are per worker, which segues nicely into…)*

**PostgreSQL — reading `loops` correctly**

```sql
EXPLAIN ANALYZE
SELECT o.id
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.email LIKE 'ananya%';
```

```txt
Nested Loop  (cost=1.20..125.30 rows=100 width=8) (actual time=0.089..1.944 rows=100 loops=1)
  ->  Index Scan using idx_customers_email on customers
        (cost=0.42..25.10 rows=50 width=8) (actual time=0.041..0.121 rows=50 loops=1)
        Index Cond: ((email)::text ~^ 'ananya'::text)
  ->  Index Scan using idx_orders_customer on orders
        (cost=0.78..1.99 rows=2 width=8) (actual time=0.029..0.033 rows=2 loops=50)
        Index Cond: (customer_id = c.id)
```

Fifty customers matched, so the inner order lookup ran **50 times** (`loops=50`). Here's the part almost everyone misses: in PostgreSQL, the `actual time` on a looping node is the **average per loop**, not the total. Total time on that inner scan ≈ `0.033 ms × 50 ≈ 1.65 ms`. If a node shows innocent-looking `0.02 ms` with `loops=50000`, that's a full second hiding in plain sight.

**PostgreSQL — inspecting a write without performing it**

```sql
BEGIN;
EXPLAIN ANALYZE
DELETE FROM orders WHERE created_at < now() - interval '18 months';
ROLLBACK;
```

The delete genuinely executes — locks taken, triggers fired, rows walked — and then the rollback puts the data back exactly as it was. Do this any time someone asks you to "check if that DELETE would be fast."

**SQLite — the honest plan reader (verified on sqlite 3.51.0)**

SQLite has no `EXPLAIN ANALYZE`; `EXPLAIN QUERY PLAN` never runs your query, so it also shows no timings — there were none to measure.

```sql
CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE INDEX idx_orders_status ON orders(status);
```

```sql
EXPLAIN QUERY PLAN SELECT id FROM orders WHERE status = 'shipped';
```

```txt
QUERY PLAN
`--SEARCH orders USING COVERING INDEX idx_orders_status (status=?)
```

`COVERING INDEX` means the whole answer comes out of the index alone — the table is never touched. Change the query to `SELECT *` and it downgrades, because the index alone isn't enough anymore:

```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE status = 'shipped';
```

```txt
QUERY PLAN
`--SEARCH orders USING INDEX idx_orders_status (status=?)
```

And drop the index entirely (or filter on an unindexed column) and it tells you the painful truth in one word:

```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 42;
```

```txt
QUERY PLAN
`--SCAN orders
```

`SCAN` = read the whole table. `SEARCH` = use an index to jump to matching rows. That SCAN/SEARCH distinction plus the word `COVERING` covers 80% of what you need from SQLite plan reading. Plain `EXPLAIN` (without `QUERY PLAN`) goes one level lower and dumps the virtual-machine bytecode — useful occasionally, unreadable often.

**MySQL — the tree that finally made sense (8.0.18+)**

```sql
EXPLAIN ANALYZE
SELECT o.id
FROM customers c
JOIN orders o ON o.customer_id = c.id
WHERE c.country_code = 'IN';
```

```txt
-> Nested loop inner join  (cost=1054 rows=993) (actual time=0.15..41.2 rows=1000 loops=1)
    -> Filter: (c.country_code = 'IN')  (cost=101 rows=993) (actual time=0.041..27.8 rows=1000 loops=1)
        -> Table scan on c  (cost=101 rows=9930) (actual time=0.02..21.4 rows=10000 loops=1)
    -> Index lookup on o using idx_orders_customer (customer_id=c.id)
         (cost=0.95 rows=1) (actual time=0.011..0.012 rows=1 loops=1000)
```

Same concepts — estimates in parentheses, then `(actual time=first..last rows=n loops=m)` — but rendered as a tree, times in milliseconds, and unlike Postgres, MySQL's actual time is reported **per iteration already multiplied into the totals shown**, so read the docs for your minor version rather than assuming either convention. Two hard limits to know: pre-8.0.18 servers don't have the statement (use plain `EXPLAIN` plus `optimizer_trace`), and it refuses non-`SELECT` statements outright — a rare case of a database protecting you from yourself.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is EXPLAIN ANALYZE, and how is it different from plain EXPLAIN?**

Plain `EXPLAIN` asks the planner for its intended execution plan — the tree of operations plus its estimates for rows and cost — and returns it without touching the data. `EXPLAIN ANALYZE` compiles the same plan and then actually executes the statement, annotating every node with ground truth: actual time spent, actual rows produced, and how many loops the node ran. So `EXPLAIN` answers "what do you intend to do?", while `EXPLAIN ANALYZE` answers "what did you actually do, and did your intentions survive contact with real data?" The critical operational consequence: because `EXPLAIN ANALYZE` executes, running it against an `UPDATE` or `DELETE` performs that write — in PostgreSQL you wrap it in `BEGIN … ROLLBACK`; MySQL's version only accepts `SELECT`s; SQLite doesn't have it at all and offers `EXPLAIN QUERY PLAN` instead, which never executes.

**Q: My query's plan looks fine in EXPLAIN — right indexes, low cost — but it's still slow in production. Walk me through it.**

First thing I check is whether I'm looking at guesses or reality, so I re-run it with `EXPLAIN ANALYZE` (or `EXPLAIN (ANALYZE, BUFFERS)` in Postgres) and compare the `rows=` estimate against `rows=` actual on every major node. Nine times out of ten there's a divergence somewhere — planner thought 1 row, reality was a million — which means the statistics are lying. Then I ask why: was there a recent bulk insert or migration that outran autovacuum's auto-analyze (check `last_analyze` / `last_autoanalyze` in `pg_stat_user_tables`)? Is the predicate comparing a column against something the histogram has never seen? Is a function wrapped around the indexed column making it unsargable? The usual fix sequence is: run `ANALYZE` on the offending tables, re-check the plan flip, and only then reach for index changes. If estimates and actuals agree everywhere and it's *still* slow, then I look at buffers — maybe it's doing a million logical reads of cold pages — and at whether the app is calling this query N+1 times rather than the query itself being slow.

**Q: What do cost, rows, actual time, and loops mean in the output?**

`rows` on the estimate side is the planner's prediction of how many rows the node emits, derived from column statistics. `cost` is an abstract unit of estimated effort — first number is cost before producing the first row, second is total — useful only for comparing candidate plans against each other at planning time; it is emphatically not milliseconds and must never be compared to wall-clock time. `actual time` is measured milliseconds between the node emitting its first and last row. And `loops` is how many times that node executed — the inner side of a nested loop runs once per outer row. The subtlety worth saying out loud: in PostgreSQL, `actual time` is averaged per loop, so total time is roughly `actual_time × loops`. People routinely bless a node showing `0.02ms` and never notice `loops=500000`.

**Q: Is it safe to run EXPLAIN ANALYZE on a production database?**

On a read-heavy `SELECT`, usually yes — it's just executing a query you could run anyway, though a heavy one under `EXPLAIN ANALYZE` adds real load, so mind your `statement_timeout` and run it off-hours or on a replica if the query is expensive. On anything that writes, absolutely not bare: it performs the write. In Postgres the pattern is `BEGIN; EXPLAIN ANALYZE <statement>; ROLLBACK;` — the rollback undoes the row changes. But know what rollback *doesn't* undo: triggers fired along the way may have queued notifications or written audit entries with side effects, sequences advanced permanently (sequence increments aren't transactional), and you held locks the whole time. So even the safe pattern belongs on staging or a low-traffic window for anything serious. MySQL sidesteps half of this by rejecting writes entirely.

**Q: How would you speed up a massive UPDATE or DELETE, and prove the improvement, without changing data?**

In Postgres: `BEGIN; EXPLAIN ANALYZE DELETE ...; ROLLBACK;` gives me a true execution with real timings, then puts every row back. Inside that output I look at the same signals as a SELECT: is it scanning the whole table when an index on the filter column would do (watch `Rows Removed by Filter`), are the estimates sane, what do buffers say about I/O volume? Typical wins are batching the delete by range, ensuring the predicate column is indexed, and dropping any per-row triggers that fire a million times. In MySQL I'd prototype with a `SELECT` using the same `WHERE` clause under `EXPLAIN ANALYZE`, since its explain-analyze refuses writes — the access path for selecting those rows is the same one the delete will take.

**Q: Why would the query planner ever pick a terrible plan? Isn't that its whole job?**

The planner is only as good as its inputs, and its main input is statistics. Stale statistics after a bulk load mean it's planning against a table that no longer exists — that's the million-shipped-orders story above. Values outside the recorded histogram (a brand-new status code, today's date in a timestamp range) get rough guesses. Correlated columns break the independence assumption — filtering on city *and* zip independently multiplies two selectivities that aren't independent, wildly overestimating matches; Postgres's answer is explicit extended statistics (`CREATE STATISTICS`). Non-sargable predicates like `WHERE lower(email) = ...` or date functions wrapped around columns blind the planner to the index. And there's plan caching: Postgres switches prepared statements to a generic plan after a few executions, which may fit some parameter values terribly. None of these are planner bugs — they're all cases where the inventory sheet stopped describing the pantry.

**Q: Does this tool exist everywhere, or is it a Postgres thing?**

It's dialect-specific and I'd name the map explicitly: PostgreSQL — `EXPLAIN ANALYZE`, executes, richest options (`BUFFERS`, `FORMAT JSON`, per-node loops); MySQL — `EXPLAIN ANALYZE` since 8.0.18, executes, tree output, SELECT-only; SQLite — no such command, use `EXPLAIN QUERY PLAN` for the plan (never executes, no timings) and plain `EXPLAIN` for bytecode. Treating these as interchangeable is a small tell in an interview; knowing which one executes and which ones don't is a large one.

## 6. The Traps — What Goes Wrong in Production

**Running EXPLAIN ANALYZE on an UPDATE or DELETE and thinking it's a dry run.** The wrong assumption: "explain" sounds read-only, so the statement is inspected but not performed. It's wrong because `ANALYZE` here means *execute and measure*, not *analyze the text*. What actually happens: the update commits its changes the moment it finishes (in autocommit mode), triggers fire, locks are held — on a busy table, you've just mutated production data to satisfy your curiosity. The fix: always `BEGIN; EXPLAIN ANALYZE <write>; ROLLBACK;` in Postgres, and even then prefer a staging copy for anything destructive, because rollback restores rows but not non-transactional fallout like advanced sequences or externally visible trigger effects.

**Reading `loops` as decoration.** The wrong assumption: `actual time=0.033` means the node cost a third of a millisecond. Wrong because Postgres averages per execution of the node, and nested-loop inner nodes execute once per outer row. What happens: a plan node that ran 50,000 times at 0.03ms apiece — 1.5 seconds — gets waved through review because everyone stared at the tiny per-loop number. The fix: make `time × loops` a reflex, or eyeball the parent node's cumulative actual time and investigate any child whose share looks impossible.

**Treating `cost` as milliseconds.** The wrong assumption: `cost=8.45` means 8ms. Wrong because cost units are an internal model mixing page reads and CPU comparisons, calibrated for ranking plans, not predicting latency. What happens: someone "proves" a query got faster because cost dropped, while users feel no difference — or worse, distrusts a fast plan because its cost number looks big next to another query's. The fix: compare costs only between alternative plans for the *same* query at planning time; judge real speed exclusively by actual time and `Execution Time`.

**Ignoring the estimate-vs-actual gap because the query eventually finished.** The wrong assumption: slow-but-correct is acceptable and the plan shape matters more than the numbers. Wrong because the gap is the diagnosis, not a curiosity. What happens: the team keeps micro-tuning indexes while the planner keeps choosing nested loops for million-row joins, and every "fix" mysteriously fails to help. The fix: whenever `rows` diverges by 10x or more, run `ANALYZE` on the involved tables and re-read the plan before changing any schema object — and after bulk loads, run `ANALYZE` proactively instead of waiting for autoanalyze's threshold.

**Tuning against a toy dataset.** The wrong assumption: a plan validated locally will behave the same in production. Wrong because every choice the planner makes scales with table size and value distribution — the seq-scan-versus-index crossover point literally moves. What happens: the 10k-row dev table shows the fancy index winning; production's 200M rows pick a seq scan, or vice versa. The fix: test with production-shaped volume (restore a sanitized subset at real scale, at minimum), and compare plans with `EXPLAIN ANALYZE` in an environment whose statistics resemble prod's.

**Assuming the same command works the same everywhere.** The wrong assumption: `EXPLAIN ANALYZE` is portable SQL. Wrong because it's three different tools sharing a name: Postgres's executes everything including writes; MySQL's (8.0.18+) executes but rejects writes; SQLite's doesn't exist. What happens: scripts break on older MySQL, someone tries `EXPLAIN ANALYZE` in sqlite3 and hits a parse error mid-incident, or the Postgres write-executes surprise above. The fix: name the engine first, then the tool.

## 7. Compare With Related Concepts

**`EXPLAIN` vs `EXPLAIN ANALYZE`.** Both print the plan tree; the difference is execution. Plain `EXPLAIN` is free, instant, side-effect-free, and shows only estimates — the planner's intent. `EXPLAIN ANALYZE` pays the runtime cost and shows intent *plus* reality. Rule: start with plain `EXPLAIN` to sanity-check the plan shape cheaply, escalate to `EXPLAIN ANALYZE` the moment you need proof of where the time actually goes.

**`EXPLAIN QUERY PLAN` (SQLite) vs `EXPLAIN ANALYZE` (Postgres/MySQL).** `EXPLAIN QUERY PLAN` shows SQLite's chosen strategy — SCAN vs SEARCH, which index, join order — and provably never runs the statement, which is why it reports no times at all. It's plan-only by design, the way plain `EXPLAIN` is elsewhere. Rule: on SQLite, `EXPLAIN QUERY PLAN` for everyday plan checks (and `EXPLAIN` if you truly need bytecode-level detail); there is simply no execution-measuring tool, so benchmark with `.timer`/`time` alongside it.

**`ANALYZE` (the statistics command) vs `EXPLAIN ANALYZE` (the plan runner).** The name collision is genuinely unfortunate, because they do unrelated jobs. Bare `ANALYZE` samples your tables and refreshes the planner's statistics — it displays nothing and changes no query results, only future *plans*. `EXPLAIN ANALYZE` runs one statement and reports measurements — it changes no statistics and improves nothing by itself. Rule: `ANALYZE` feeds the guesses, `EXPLAIN ANALYZE` exposes them; when the exposed guesses are wrong, the fix is the other command. (MySQL's flavor is `ANALYZE TABLE`; SQLite also accepts plain `ANALYZE`.)

For where this fits in the broader debugging workflow — indexes, lock waits, N+1s from the application layer — see [how-do-you-debug-a-slow-query.md](./how-do-you-debug-a-slow-query.md), and for the plan vocabulary itself see [what-is-query-execution-plan.md](./what-is-query-execution-plan.md) and [what-is-explain.md](./what-is-explain.md).

## 8. 🧠 The Memory Hook

Plain `EXPLAIN` is the chef reading his chosen recipe off the inventory sheet. `EXPLAIN ANALYZE` hands him the ingredients and starts the stopwatch — the dish gets cooked for real, so never hand him a DELETE unless you've promised to throw the food away afterward (`BEGIN … ROLLBACK`). And when the recipe says "serves 1" but a million plates come out, stop redesigning the kitchen and update the sheet: run `ANALYZE`.
