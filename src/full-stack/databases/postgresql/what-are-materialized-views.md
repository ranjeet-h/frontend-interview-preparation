# What are materialized views

## 1. The Real-World Problem — When You Actually Hit This

Your team ships an admin dashboard. On it there's one innocent-looking chart: revenue by day, by region. The query behind it joins `orders`, `order_items`, and `customers` and does a big `GROUP BY` over months of data. With 10,000 test rows it returned in 40ms, so nobody thought twice.

Six months later the dashboard takes 8 seconds to load. The database CPU graph has a heartbeat made entirely of analysts hitting refresh. Every single page view re-runs the exact same expensive aggregation over the exact same mostly-unchanged data, gets almost the same answer, throws it away, and recomputes it on the next click. Meanwhile your real product queries are fighting that aggregation for CPU.

That's the moment someone says the magic words: "why don't we just compute this once and store the answer?" That instinct is exactly what a materialized view is. And — this is the part interviews dig into — storing the answer creates a brand-new problem the original query never had: the stored answer goes stale, and in vanilla Postgres, nothing ever freshens it up for you.

## 2. The Analogy — Make the Mechanic Obvious

Picture two ways a company can share its sales numbers internally.

Option one is a **live screen** mounted on the wall, connected straight to the sales system. Anyone who walks by sees the current numbers, down to the second. But every glance costs something — the screen is constantly querying the source, and if a hundred people stare at it all day, the sales system is doing a hundred people's worth of work continuously. That's a regular view: a saved question that gets answered fresh, from scratch, every time anyone looks.

Option two is a **printed report**: someone runs the numbers once, prints a hundred copies, and leaves them in the lobby. Now reading is free. Any number of employees can pick up a copy instantly, and the sales system feels nothing. But every copy is frozen at the moment of printing. If yesterday's numbers change, all hundred copies in the lobby quietly become wrong — and here's the key detail — *nobody reprints the report automatically*. Printing was a decision someone made. Reprinting is another decision.

Now map the annoying parts, because they matter most. Reprinting takes time — for a big report, minutes. In Postgres, a plain `REFRESH MATERIALIZED VIEW` is like pulling every copy off the lobby shelf before starting the print run: while the new edition prints, nobody can read anything (that's the exclusive lock). `REFRESH MATERIALIZED VIEW CONCURRENTLY` is smarter: it prints the new edition alongside the old one and swaps pages in place when done — readers keep reading the old edition the whole time. But to swap page-by-page instead of whole-book, the printer needs every line numbered uniquely — that's why `CONCURRENTLY` demands a unique index on the view first.

One copy of the report, zero cost per reader, guaranteed staleness, and a human (or a scheduled job) owning the reprint schedule. That's the entire concept.

## 3. The Full Explanation — How It Actually Works

In plain English first: a regular view is a saved *query*. Postgres stores only the SQL text, and every `SELECT` against the view re-runs that SQL against the live tables — always current, always paying full price. A materialized view is a saved *result*. Postgres runs the query once at creation, writes the output rows to disk like a real table, and from then on, reading the materialized view is literally reading stored rows. Table-speed reads. No re-computation, ever, until you explicitly say so.

That word — explicitly — carries the whole trade-off. Here are the mechanics you're expected to know cold:

**Results are physically stored.** A materialized view occupies disk space, gets vacuumed like a table, and can carry its own indexes (they are *not* inherited from the base tables or from the defining query — you create them yourself after creation, same as a table). Internally Postgres treats it as a relation you can't INSERT/UPDATE/DELETE into directly; the only write path is a refresh.

**Refreshing replaces the contents.** `REFRESH MATERIALIZED VIEW name` re-runs the defining query from scratch and swaps the stored rows for the new result. For a view built over millions of base rows, that's a full re-aggregation — seconds to many minutes. During a plain refresh, Postgres holds an `ACCESS EXCLUSIVE` lock on the materialized view: every reader — your dashboard, your API, everything querying that view — queues up and waits until the rebuild finishes. On a busy production table, a naive refresh is a self-inflicted outage of everything that reads that view.

**CONCURRENTLY removes the reader-blocking, at a price.** `REFRESH MATERIALIZED VIEW CONCURRENTLY name` builds the new result into temporary storage, diffs it against the current contents using a unique index you must have created on the view, and applies just the differences. Readers never block — they see the old consistent contents until their query finishes, then new contents afterward. The costs: it needs that unique index up front, it's slower than a plain refresh, it generates noticeably more WAL (which lands on replicas as replication lag), two concurrent refreshes of the same view can't overlap, and it refuses to run if the view was created `WITH NO DATA` and never populated — you have to do one plain refresh first.

**Nothing refreshes itself.** This is the part people get wrong constantly. Vanilla PostgreSQL has no auto-refresh, no TTL, no trigger-on-data-change for materialized views. If you create one and walk away, it shows the world as it looked at creation time — forever. Keeping it fresh is your job: a cron job shelling into `psql`, the `pg_cron` extension scheduling it inside the database, or a background worker in your app. Along with the refresh mechanism, you should design the freshness contract: log each successful refresh with a timestamp so the application can display "figures as of 14:00" instead of silently presenting hours-old numbers as if they were live.

**So when is staleness acceptable?** Whenever the consumer wants a trend, not a fact about right now. Dashboards, weekly reports, leaderboards, "revenue by region," analytics feeds — if a five-minute-old or even a one-day-old answer is fine, a materialized view turns an 8-second query into a millisecond read. When is it not acceptable? Anything where acting on stale data causes real damage: charging a card based on a stale balance, selling the last item twice because inventory counts were frozen, permission checks computed from a stale snapshot. Transactional correctness belongs to ordinary queries against the base tables, not to a snapshot.

**How it interacts with the rest of the system:** a refresh is essentially a bulk write — it produces WAL (replicas lag during big refreshes), it bloats the view over repeated concurrent refreshes (vacuum it like a table), and it competes with production traffic for I/O, which is why refreshes belong off-peak regardless of locking. Security-wise, a materialized view is a great boundary: users can be granted SELECT on the view without any access to base tables — but remember they're seeing the snapshot, including whatever rows happened to exist at refresh time.

The honest summary of the trade: you give up freshness guarantees, disk space, and refresh operations you now own — and in exchange, an expensive read becomes as cheap as reading a small table.

## 4. See It In Practice — Real Code or Queries

The slow dashboard query, turned into a materialized view. All syntax below is PostgreSQL-specific where noted.

```sql
-- The expensive aggregation, computed ONCE and stored.
-- Everything here is standard PostgreSQL.
CREATE MATERIALIZED VIEW mv_revenue_by_day_region AS
SELECT
    (DATE_TRUNC('day', o.created_at))::date AS revenue_day,
    c.region,
    SUM(oi.quantity * oi.unit_price_cents) AS revenue_cents,
    COUNT(DISTINCT o.id)                   AS order_count
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN customers c    ON c.id = o.customer_id
WHERE o.status = 'paid'
GROUP BY 1, 2;

-- REQUIRED before CONCURRENTLY refreshes work:
-- a unique index on the view. Pick the natural key of a row
-- here (one row per day per region). Without this index,
-- REFRESH ... CONCURRENTLY fails with an error.
CREATE UNIQUE INDEX idx_mv_rev_day_region
    ON mv_revenue_by_day_region (revenue_day, region);

-- Optional but recommended: index the columns the dashboard filters on.
CREATE INDEX idx_mv_rev_day_region_day
    ON mv_revenue_by_day_region (revenue_day);
```

Reading it is now a cheap scan of stored rows — this is what replaced the 8-second query:

```sql
SELECT revenue_day, region, revenue_cents
FROM mv_revenue_by_day_region
WHERE revenue_day >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY revenue_day DESC;
```

The two refresh modes, and when each is safe:

```sql
-- BLOCKS ALL READERS of the view until done (ACCESS EXCLUSIVE lock).
-- Fine on a quiet reporting replica or at 3am; dangerous mid-day on prod.
REFRESH MATERIALIZED VIEW mv_revenue_by_day_region;

-- Non-blocking for readers: they keep seeing the old snapshot while
-- the diff is applied. Slower, more WAL. Requires the unique index above,
-- and requires the view to already be populated.
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_by_day_region;
```

Scheduling the refresh, because Postgres will never do it for you. Inside the database with the `pg_cron` extension:

```sql
SELECT cron.schedule(
    'refresh-revenue-view',           -- job name
    '*/15 * * * *',                   -- every 15 minutes, off the top of traffic
    $$REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_by_day_region$$
);
```

Or from outside the database, plain cron calling psql: `*/15 * * * * psql "$DATABASE_URL" -c "REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_by_day_region"`.

Finally, the freshness contract — record when the snapshot was taken so the app can admit its age instead of faking liveness:

```sql
CREATE TABLE mv_refresh_log (
    view_name    text PRIMARY KEY,
    refreshed_at timestamptz NOT NULL DEFAULT now()
);

-- Run both statements in one transaction so the timestamp
-- matches the data actually visible in the view.
BEGIN;
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_revenue_by_day_region;
INSERT INTO mv_refresh_log (view_name) VALUES ('mv_revenue_by_day_region')
ON CONFLICT (view_name) DO UPDATE SET refreshed_at = now();
COMMIT;
```

```ts
// App side: pair the numbers with their age.
const { rows } = await db.query(
  `SELECT v.revenue_day, v.region, v.revenue_cents, l.refreshed_at
   FROM mv_revenue_by_day_region v
   CROSS JOIN mv_refresh_log l
   WHERE l.view_name = 'mv_revenue_by_day_region'
     AND v.revenue_day >= CURRENT_DATE - INTERVAL '30 days'
   ORDER BY v.revenue_day DESC`
);
res.json({ data: rows, asOf: rows[0]?.refreshed_at ?? null });
```

One more variant worth knowing — build the shell first, fill it later, for very large datasets:

```sql
-- Creates the view with zero rows so DDL returns immediately;
-- the first REFRESH (a plain one — CONCURRENTLY won't work yet)
-- does the expensive initial population.
CREATE MATERIALIZED VIEW mv_huge_report AS
SELECT ... FROM events WHERE ...
WITH NO DATA;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a materialized view, and how is it different from a regular view?**

A regular view is just a stored query — Postgres keeps the SQL and re-executes it against the live base tables every time you select from it, so results are always current and always cost full computation. A materialized view executes that query once and stores the resulting rows on disk like a table; reads hit stored data at table speed, with no recomputation. The consequence of storing the result is staleness: the materialized view reflects the data as of its last refresh, and in vanilla Postgres nothing updates it automatically — refreshing is an explicit operation somebody has to schedule. So the one-line contrast: a view trades read speed for guaranteed freshness; a materialized view trades freshness for read speed.

**Q: When would you choose a materialized view over just adding an index or optimizing the query?**

An index speeds up finding rows, but some queries are expensive because of the aggregation itself — grouping millions of joined rows into thousands of summary rows is inherently a lot of work no index removes. When the same heavy aggregation is requested far more often than the underlying data meaningfully changes, and slightly-old answers are acceptable, computing it once and storing it wins decisively. My checklist: measure the query with EXPLAIN ANALYZE first to rule out a missing index or bad plan; confirm the read-to-write ratio favors caching the result; confirm the business tolerates bounded staleness; only then reach for the materialized view plus a refresh strategy. If staleness is *not* acceptable, no amount of materializing helps — the answer has to come from live data.

**Q: Walk me through what happens during `REFRESH MATERIALIZED VIEW`. Why does it cause problems in production?**

A plain refresh re-runs the entire defining query from scratch and replaces all stored rows with the new result. While that runs, Postgres holds an ACCESS EXCLUSIVE lock on the materialized view — not just blocking other writers, but blocking every reader too. On a busy system that means every dashboard request and every API call touching that view piles up waiting, connections exhaust, and you've effectively taken down the read path for the duration of a potentially minutes-long aggregation. That's why production refreshes use `CONCURRENTLY`: it computes the new version separately, diffs it against the current rows via a unique index, and applies the changes without blocking readers — they finish reading the old snapshot while the new one lands. The costs of CONCURRENTLY are that it requires that unique index beforehand, runs slower, generates more WAL, and can't run on a view that was never populated.

**Q: How do you keep a materialized view fresh in PostgreSQL?**

You own it — there's no built-in auto-refresh. The common patterns: a cron job invoking psql with the REFRESH statement, the pg_cron extension scheduling it inside the database, or an application background worker. Two design points beyond the mechanism itself. First, schedule around traffic and replication: refreshes are bulk writes producing WAL, so off-peak intervals beat "every minute forever." Second, define the freshness contract explicitly — I log a refreshed_at timestamp in the same transaction as the refresh and expose it through the API ("figures as of 14:00"), and I alert when the view is staler than its agreed SLA. A silent refresh failure is worse than no materialized view, because the app keeps confidently serving ancient data.

**Q: Can you index a materialized view? Does it inherit indexes from the base tables?**

Yes, you can and usually should index it — but nothing is inherited. A materialized view starts life as an unindexed heap, regardless of what indexes the base tables or the defining query use, so a large unindexed matview can still be slow to filter. After creation I add a unique index on the logical key of each row (which doubles as the prerequisite for CONCURRENTLY refreshes) plus ordinary indexes matching the dashboard's WHERE and ORDER BY clauses. After that it behaves like a well-indexed read-only table.

**Q: When is a materialized view the wrong tool?**

Whenever the consumer needs a fact about right now rather than a trend. Balances, inventory counts at checkout, seat booking, permission checks — decisions whose correctness depends on the current committed state must read live base tables inside the normal transaction path, because a snapshot can be arbitrarily old and Postgres gives you no way to know data changed except by comparing to the source. Also wrong: a base table that changes every second under the query (refresh cost approaches the original problem), and cases needing true incremental updates — vanilla Postgres rebuilds the whole result on every refresh, so truly huge views are better served by hand-maintained summary tables updated per-write, or by a separate analytical store.

**Q: Is a materialized view a form of denormalization?**

Yes — it's the flavor where the database owns the recipe. Like any denormalization it stores a derived copy so reads stop reconstructing. The special property is that Postgres knows exactly how the copy was built, so `REFRESH` can always rebuild it perfectly from the base tables: drift (the copy permanently disagreeing with the truth) is impossible by construction — only staleness (temporarily behind the truth) is possible, and staleness is bounded by your refresh schedule. Compare that to a counter column my application code maintains: drift becomes possible too, because my sync code can miss a case. That asymmetry is the strongest argument for preferring a materialized view whenever scheduled staleness is acceptable.

**Q: What would you monitor around materialized views in production?**

Four things. Refresh success and duration (a failed or suddenly-slow refresh means the freshness contract is breaking). Snapshot age — refreshed_at versus now, alerted against the agreed SLA. View size and bloat — repeated CONCURRENTLY refreshes create dead tuples, so vacuum stats matter like any table. And WAL/replication-lag spikes correlated with refresh windows, since a big refresh lands on every replica.

## 6. The Traps — What Goes Wrong in Production

**Assuming it updates itself like a regular view.** The wrong assumption: "I created the view, Postgres maintains it — the dashboard shows current data." Why it's wrong: that's the contract of a *regular* view. A materialized view stores a result, and vanilla PostgreSQL has no auto-refresh, no TTL, nothing — it will happily serve data from creation time forever. What actually happens: the dashboard looks perfect on launch day, weeks later finance reconciles against the ledger and the numbers diverge by millions, and nobody can say when it went stale because nothing was logging refreshes. The fix: treat the refresh schedule as part of designing the view — cron or pg_cron, a refreshed_at log exposed through the API, and an alert when the snapshot exceeds its staleness budget.

**Running plain REFRESH against a busy production view.** The wrong assumption: "a refresh is a quick background update; readers won't notice." Why it's wrong: a plain refresh takes an ACCESS EXCLUSIVE lock and holds it for the entire re-aggregation — for a large view that's minutes during which *every reader blocks*, not just writers. What actually happens: someone triggers a manual refresh at 2pm, every dashboard request hangs, connection pools fill with waiting queries, and adjacent endpoints start failing because the pool is exhausted. The fix: create the unique index up front and always use `REFRESH MATERIALIZED VIEW CONCURRENTLY` in production, schedule heavy refreshes off-peak anyway (it still burns I/O and WAL), and never rely on ad-hoc manual refreshes during business hours.

**Creating the view and calling performance done — unindexed and unpoppulated edge cases included.** Two related mistakes hide here. First: assuming the view inherits useful indexes from the base tables or the query — it doesn't; it arrives as a bare heap, so a "materialized" dashboard can still crawl if you forgot to index `(revenue_day)` or the unique key. Second: building a giant view `WITH NO DATA` and going straight to `CONCURRENTLY` — which errors out, because the diff-based refresh needs populated contents to diff against; you must do one plain (blocking) refresh first, ideally before the feature ships. What actually happens either way: the team concludes "materialized views are slow" when the actual bug is missing setup. The fix: creation checklist — unique index, read-path indexes, initial population, *then* concurrent refreshes on a schedule.

## 7. Compare With Related Concepts

**vs. a regular [view](what-are-database-views.md).** A view is a saved query executed live on every read — always current, always paying the query's full cost; a materialized view is a stored result — table-speed reads, frozen at last refresh. Rule: use a plain view for convenience, security boundaries, and queries that stay fast; use a materialized view when the query is expensive, read-hot, and allowed to be slightly old.

**vs. a hand-built cache/summary table.** A summary table you create and populate yourself gives you total control — you can update it incrementally per-write, achieving near-zero staleness — but your code owns the arithmetic, so drift bugs become possible and the schema is yours to maintain. Rule: use a hand-maintained summary table when you need same-transaction accuracy or incremental updates; use a materialized view when scheduled staleness is acceptable and you want the database guaranteeing the copy can always be rebuilt correctly from the truth.

**vs. denormalized columns.** Putting a cached aggregate directly on a row (`customers.lifetime_spend_cents`) is the finest-grained form of [denormalization](../sql/what-is-denormalization.md) — cheapest possible read, highest sync burden, and drift risk lives in your write path. A materialized view keeps derived data out of the source tables entirely, in its own refreshable object. Rule: a counter/summary column for a value one row genuinely needs attached to it, maintained in the same transaction as the write; a materialized view for report-shaped aggregates that many consumers read on their own schedule.

**vs. an external cache (Redis-style).** An application cache sits outside the database, is disposable, and falls back to the source on miss; a materialized view lives inside the database — durable, transactional, joinable, indexed, backed up, visible to every language and BI tool that speaks SQL. Rule: cache in the app layer when a miss can afford a trip to the source and you want to protect the database from load; materialize in the database when the query itself must get cheaper and the result should be a shared, governed dataset rather than a private app shortcut.

## 8. 🧠 The Memory Hook

A materialized view is a **photo of the answer, not a window onto it** — reads are instant because the picture is already taken, and the picture ages until someone re-shoots it. In Postgres nobody re-takes the photo for you: plain REFRESH stops all readers mid-print, CONCURRENTLY swaps the new print in page-by-page but demands a unique index first, and the refresh schedule — like the staleness — is entirely yours to own.
