# When Can Indexes Hurt Performance

## 1. The Real-World Problem — When You Actually Hit This

A payments service runs fine for two years. Then someone notices the ops dashboard queries are a bit slow and spends an afternoon adding five indexes to the `order_events` table — one on `status`, one on `channel`, one on `created_at`, a couple more, all added "just in case" because indexes make things faster, right?

Nothing breaks that day. Or that month. Six months later the table holds 400 million rows, and the symptoms show up everywhere except where anyone is looking. Insert latency creeps up. The nightly settlement batch that used to finish in twenty minutes now hits its two-hour timeout. Replicas fall behind during peak hours. The disk fills up faster than the growth in data explains. Checkout requests occasionally time out because the insert behind them got slow, and clients retry, and now support is asking why customers see duplicate orders.

Nobody connects it to the five indexes, because the indexes were added back when everything was fine. That's the trap this page teaches you to see: **an index is not a free upgrade**. Every index is a second, third, fourth copy of your data in sorted form, and every copy has to be updated every single time the data changes. Used well, indexes are the biggest performance lever you have ([how they help](what-is-indexing.md)). Used carelessly, they quietly tax every write in the system — and the bill arrives months later, in production, at the worst possible moment.

## 2. The Analogy — Make the Mechanic Obvious

Picture a filing cabinet where you keep customer folders — one folder per customer. Next to the cabinet sit several card catalogs. Each catalog is sorted differently: one by last name, one by city, one by signup date. Each card in a catalog says "folder #4821" so you can jump straight to the right folder without flipping through the whole cabinet.

The catalogs are indexes. They're brilliant when someone walks in asking "find me everyone named Garcia in Pune" — you go to the name catalog, then the city catalog, and you're done in seconds instead of reading thousands of folders.

Now feel what happens on the *writing* side, because this is where the analogy earns its keep:

A new customer signs up. You file the folder in the cabinet — and then you have to hand-write a card in **every single catalog**, sliding it into its correct sorted position. Ten catalogs, ten cards, every time. A customer closes their account? Pull the folder and fish its card out of all ten catalogs. A customer moves cities? The city catalog card is now in the wrong spot — pull it out and re-file it. The cabinet is the table; the catalogs are the indexes; every change to the folders is a change to every catalog.

The costs stack up exactly the way they do in a database:

Shelf space — those catalogs aren't free. Ten catalogs can easily occupy more shelf space than the cabinet itself. That's storage. Worse, the room only has so much desk space (memory), and every extra catalog sprawls across it, so the catalogs you actually use are harder to reach quickly. That's cache pressure.

Duplicate catalogs — someone made a catalog sorted by last name, then later another sorted by last name *and then* first name. Look closely: the second catalog answers every question the first one could, plus more. The first is pure dead weight — but someone still files a card in it on every change. Those are duplicate-prefix indexes.

A useless-but-expensive catalog — someone made a catalog sorted by eye color. Almost nobody ever asks by eye color, and when they do, three-quarters of the cards say "brown," so the clerk flips through most of the catalog anyway. It barely helps anyone find anything — but it still costs a fresh card on every single new folder. That's a low-selectivity index.

And the 5pm crunch — everyone filing end-of-day paperwork appends to the very last page of the date-sorted catalog at the same time, and they physically bump into each other at that one page. That's hot-page contention, and it has a direct database equivalent we'll get to.

One person maintaining four catalogs is a nuisance. A thousand clerks (concurrent transactions) maintaining fifteen catalogs while customers wait (request latency) is an outage waiting to happen.

## 3. The Full Explanation — How It Actually Works

With the picture in place, here's the mechanic underneath. An index is a separate sorted data structure — almost always a B-tree — whose entries point at rows. Sorted structure is the whole magic: it turns "scan everything" into "binary-search your way to the answer." But sorted is also the whole cost: **sorted things resist change**, and keeping a second sorted copy in sync with the first is work that happens on every write, forever.

**Every index taxes every write.** Take a plain insert. Into an unindexed heap, a row goes wherever there's room — cheap. Now give the table one secondary index: the same insert must also place an entry into that B-tree at its exact sorted position, possibly splitting a page to make room. Give it five secondary indexes: five more positioned writes. In engines like MySQL's InnoDB, where the table itself is a clustered index organized by primary key, inserting one row with five secondary indexes means writing into **six** balanced trees and logging all of it. Deletes reverse the process — an entry removed from every index. Updates hit whichever indexes contain the changed columns: change `status` and every index on `status` (plus any composite index leading with it) must delete the old entry and insert a new one.

Two engine details make this worse than it sounds. First, in InnoDB, secondary index leaves carry the primary key, so even the secondary indexes fatten with wide keys. Second, PostgreSQL has a lovely optimization called a HOT update — when an `UPDATE` changes *no indexed column* and fits on the same page, Postgres skips index maintenance entirely. The moment your update touches an indexed column, that shortcut vanishes and every index gets a new entry. So the columns people index most — status, timestamps, foreign keys — are exactly the columns that turn cheap updates into expensive ones.

All of these page changes flow into the write-ahead log, and the log flows to replicas. More indexes means more WAL bytes per transaction, which means replicas spend longer applying each transaction. This is why a freshly-indexed table often shows up next as **replication lag** — the primary kept up, the followers couldn't.

**Storage and cache pressure.** Disk usage is the obvious part: every index is roughly proportional to rows × key size, and churny tables grow bloated indexes full of half-empty pages. The sneakier part is memory. Your database keeps hot pages in RAM — Postgres calls it `shared_buffers`, MySQL calls it the buffer pool. That pool is finite, and index pages compete with table pages for it. Every useless index occupies pages that were previously holding data you actually read. Teams watch their cache hit ratio sag after an indexing spree and blame the hardware. It wasn't the hardware.

**Planner confusion and duplicate-prefix indexes.** The query planner picks an execution strategy by weighing the indexes and statistics available to it. Hand it fifteen overlapping indexes and you've given it fifteen chances to guess wrong — a stale-statistics plan that picked a barely-helpful index can turn a fast query into thousands of pointless random lookups, something you'd diagnose with [`EXPLAIN ANALYZE`](what-is-explain-analyze.md). And some of those indexes shouldn't exist at all: an index on `(customer_id)` is completely covered by one on `(customer_id, status)` — same leftmost prefix, strictly more capability. Both get maintained on every write; only one ever gets chosen. The single-column twin is pure tax.

**Low-selectivity indexes are useless yet still maintained.** Selectivity is how many rows an average value narrows things down to. An index shines when it cuts 10 million rows down to 50. An index on `is_active`, where 98% of users are active, is worthless for the common case — the planner will correctly ignore it, because jumping through an index to fetch 9.8 million scattered rows is far slower than one sequential scan. Yet that index still collects an entry on every insert and update, forever. Paying maintenance on a structure the planner refuses to use is the purest form of indexing waste.

**Unused-index cleanup is a discipline, not a cleanup day.** Because indexes accumulate silently ("for safety") and never announce their own uselessness, mature teams audit them. PostgreSQL tracks scan counts per index in `pg_stat_user_indexes`; MySQL exposes the same truth through `sys.schema_unused_indexes`. But doing this well takes judgment: counters reset on restart, so you need a real observation window covering your full business cycle — including that month-end finance report that runs one query a month against an otherwise-dead index. And some "unused" indexes must survive anyway: anything backing a UNIQUE constraint or a primary key isn't there for lookups, it's there to enforce rules. Drops should happen off-peak using non-blocking variants (`DROP INDEX CONCURRENTLY` in Postgres, online DDL in modern MySQL) so the cleanup itself doesn't cause the outage it was meant to prevent.

**Write-heavy workloads feel every index.** Put rough numbers on it with order-of-growth reasoning rather than promises: an insert into an unindexed heap is roughly one write; with N secondary indexes it's N+1 positioned writes plus their log records. At ten inserts per second nobody notices. At fifty thousand inserts per second — an events or payments table — each extra index multiplies page splits, buffer-pool churn, WAL volume, and replica work. This is why bulk-loading teams routinely drop secondary indexes, load the data, and rebuild the indexes afterward: building a B-tree once in sorted bulk is dramatically cheaper than performing millions of individual sorted insertions. The general rule for write-heavy OLTP tables: a handful of indexes serving known query shapes, nothing speculative.

**The contention footnote most candidates miss.** Indexes interact with concurrency in ways that don't show up in any single-query benchmark. Two mechanisms matter. First, more structures to touch means more work performed while row locks are held, and in InnoDB, gap locks attach to index records — more indexes means a wider collision surface for the deadlocks discussed on the [deadlock prevention](how-do-you-prevent-deadlocks.md) page. Second, the 5pm-catalog effect is real: with a monotonically increasing key (auto-increment IDs, timestamps), every insert lands on the **right-most leaf page** of that B-tree, so all concurrent writers queue on the same page's latch. A hot unique index makes it sharper still — duplicate attempts on the same key serialize behind uniqueness checks. None of this appears on a graph titled "index lookup speed," and all of it appears under production load.

So the honest summary: indexes buy read speed with a permanent, compounding write-time, storage, memory, planning, and contention cost. The skill isn't avoiding indexes — unindexed write-heavy tables are their own disaster. The skill is treating every index as a subscription you pay per write, and cancelling the subscriptions nobody uses.

## 4. See It In Practice — Real Code or Queries

Here's the table from the opening story, with the five defensive indexes, in PostgreSQL syntax:

```sql
CREATE TABLE order_events (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id     BIGINT      NOT NULL,
    customer_id  BIGINT      NOT NULL,
    status       TEXT        NOT NULL,
    channel      TEXT,
    amount_cents BIGINT      NOT NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- added "for safety" one quiet afternoon
CREATE INDEX idx_events_order_id    ON order_events (order_id);   -- probably justified: lookups by order
CREATE INDEX idx_events_customer_id ON order_events (customer_id); -- probably justified
CREATE INDEX idx_events_status      ON order_events (status);     -- suspicious: few distinct values
CREATE INDEX idx_events_channel     ON order_events (channel);    -- suspicious: who filters by channel?
CREATE INDEX idx_events_created_at  ON order_events (created_at); -- maybe, if dashboards really range-scan it
```

Every insert into this table now maintains six B-trees — the clustered-by-PK table plus five secondaries. Whether each one earns its keep is a measurement question, not a vibes question. Find out which indexes the planner actually touches:

```sql
-- PostgreSQL: scan counts per index (cumulative since last stats reset)
SELECT relname       AS table_name,
       indexrelname  AS index_name,
       idx_scan      AS times_used,
       pg_size_pretty(pg_relation_size(indexrelid)) AS size_on_disk
FROM   pg_stat_user_indexes
WHERE  schemaname = 'public'
ORDER  BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- MySQL 8: same idea via the sys schema (backed by performance_schema counters)
SELECT object_schema, object_name, index_name
FROM   sys.schema_unused_indexes;
```

An index with zero scans across a full business cycle — including month-end jobs — is a candidate for removal. Drop it without blocking traffic:

```sql
-- PostgreSQL: CONCURRENTLY avoids taking an exclusive lock on the table
DROP INDEX CONCURRENTLY idx_events_channel;

-- MySQL 8: online DDL, allows concurrent DML for most cases
ALTER TABLE order_events DROP INDEX idx_events_channel;
```

Now the two structural mistakes, because they hide in plain sight. Duplicate prefixes first:

```sql
CREATE INDEX idx_orders_customer        ON orders (customer_id);
CREATE INDEX idx_orders_customer_status ON orders (customer_id, status);

-- Any query using the first index's leftmost prefix can use the second.
-- The first is maintained forever and chosen never. Fix: keep the composite,
-- drop the single-column twin.
DROP INDEX CONCURRENTLY idx_orders_customer;
```

Low selectivity second — verify with the plan before believing any index helps:

```sql
CREATE INDEX idx_users_is_active ON users (is_active);

-- 98% of rows have is_active = true. Watch what the planner really does:
EXPLAIN SELECT * FROM users WHERE is_active = true;
-- Seq Scan: fetching 9.8M scattered rows via the index would be far slower.
-- The planner ignores the index for this query — but still maintains it
-- on every INSERT and every UPDATE of is_active. Pure cost, no benefit.

-- Contrast: for the rare value the index genuinely wins
EXPLAIN SELECT * FROM users WHERE is_active = false;
```

And the bulk-load pattern for write-heavy batches, where index maintenance is the dominant cost:

```sql
-- Maintenance-window pattern: load first, index second.
ALTER TABLE order_events DROP INDEX idx_events_created_at;
COPY order_events (order_id, customer_id, status, channel, amount_cents, created_at)
FROM '/data/batch_2026_08.csv' WITH (FORMAT csv);
-- Rebuild afterward: one sorted bulk build beats millions of incremental inserts.
CREATE INDEX CONCURRENTLY idx_events_created_at ON order_events (created_at);
```

Notice what none of this requires: exotic tuning. It's just measuring which subscriptions are actually used and cancelling the rest.

## 5. Interview Questions — All of Them, Done Properly

**Q: When can indexes actually hurt performance?**

Four situations cover most of it. First, write-heavy tables: every index adds one more sorted structure to maintain on each insert, delete, and affected update, so write latency and throughput degrade proportionally to index count. Second, resource pressure: indexes consume disk, but more importantly they consume buffer-pool memory, crowding out the table pages your hot reads need. Third, waste: low-selectivity indexes (a boolean, a status field with three values) rarely get picked by the planner yet are still maintained on every write, and duplicate-prefix indexes — `(a)` alongside `(a, b)` — are maintained forever and chosen never. Fourth, operational surprises: many overlapping indexes give the planner more chances to pick badly, extend the lock footprint of transactions, and flood the replication stream with extra WAL during bulk loads. The underlying principle: an index converts read work into permanently stored, perpetually maintained sorted copies. It helps when reads on those copies outnumber the writes paying for them.

**Q: Why exactly does every index slow down writes? Walk me through an INSERT.**

Take one INSERT into a table with five secondary indexes. The row lands in the table — in InnoDB, that means the clustered B-tree keyed by primary key. Then each secondary index needs its own entry inserted at its correct sorted position, because a sorted structure offers no "append anywhere" option — that's the entire source of its lookup speed. Each positioned insert may split a page, dirty multiple buffers, and generate redo/WAL records, all of which also ship to replicas. DELETEs remove an entry from every index; UPDATEs rewrite entries in every index containing a changed column. So the write cost isn't "table plus a bit" — it's one write per structure, per row, plus logging for all of them. With N indexes you're doing roughly N+1 tree modifications per row, which is why the difference between two indexes and twelve is invisible at ten writes per second and catastrophic at fifty thousand.

**Q: What makes an index useless even though it's being dutifully maintained?**

Selectivity. An index is worth consulting only if it dramatically narrows the candidate set — the planner compares "walk the index and fetch scattered rows" against "sequential scan" and picks the cheaper one. An index on `is_active` where 98% of rows are `true` will never be chosen for `WHERE is_active = true`, because fetching 9.8 million scattered rows loses to one sequential pass every time. But the index still receives an entry on every insert and every update of that column. The fix is to stop indexing on cardinality guesses and start verifying with the actual plan (`EXPLAIN`) and actual usage counts (`pg_stat_user_indexes` in Postgres, `sys.schema_unused_indexes` in MySQL). If the planner won't use it, you're paying rent on an empty office.

**Q: Can having too many indexes confuse the query optimizer?**

Yes, in two distinct ways. The obvious one is redundancy: an index on `(customer_id)` is a strict subset of `(customer_id, status)` — the composite serves everything the single-column one can. Keeping both means paying double maintenance for identical read capability, and it clutters the planner's search space. The subtler one is misselection: the planner chooses plans based on statistics, and more overlapping choices means more opportunities for a stale-statistics estimate to land on a barely-helpful index — turning a query that should scan sequentially into thousands of random index lookups. The discipline that prevents both: consolidate around well-designed composite indexes matching your real query shapes, drop true duplicates, and after every index change confirm the plan actually uses the intended index before declaring victory.

**Q: How do you find and safely remove unused indexes?**

Measurement first: PostgreSQL exposes per-index scan counts in `pg_stat_user_indexes` (check `idx_scan`), MySQL 8 aggregates I/O per index in `sys.schema_unused_indexes`. Judgment second, because naive drops break things. Counters reset on restarts, so observe long enough to span your entire business cycle — monthly reports, quarterly jobs, seasonal campaigns — not just one week. Exclude indexes that exist for correctness rather than speed: primary keys, UNIQUE constraints, and anything enforcing rules. Check whether an ORM or migration tooling expects the index to exist. Then drop off-peak with non-blocking operations — `DROP INDEX CONCURRENTLY` in Postgres, online DDL in MySQL — and keep the rollback script ready, because re-adding an index on a huge table takes real time. Mature teams treat this as a recurring audit, not a one-time purge, because defensive indexes regrow constantly.

**Q: You need to bulk-load 50 million rows into a heavily indexed table. What do you do?**

Load first, index second. Dropping the secondary indexes beforehand means each row insert touches just the table instead of seven sorted structures; rebuilding each index afterward is a single efficient sorted build rather than fifty million incremental insertions with page splits along the way. Keep the primary key in place if you can — it usually defines the physical layout and enforces integrity. Batch the load into transactions so you're not holding one enormous transaction (or blowing the WAL stream past what replicas can apply), and disable/suppress triggers if they'd fire per-row. If the load can't afford downtime, the alternative is loading into an unindexed staging table and swapping it in, or accepting the slower load with indexes present — but know explicitly that index maintenance is the bottleneck you chose. This question tests whether you understand that the index count, not row count alone, sets bulk-write cost.

**Q: Do indexes affect locking, contention, or replication — beyond raw write speed?**

They do, and senior candidates bring this up unprompted. On locking: more index entries touched per statement means more locks and gap locks held per transaction — in InnoDB, gap locks attach to index records, so extra indexes widen the surface where two transactions' locked ranges overlap, which feeds deadlocks. Uniqueness enforcement adds serialization: concurrent inserts colliding on the same unique key block each other. There's also physical contention: with a monotonically increasing key like auto-increment or timestamp, every insert targets the rightmost leaf of the B-tree, so all writers pile onto one page's latch — the classic insert hotspot. On replication: every index modification emits WAL/binlog records, so index-heavy bulk loads translate directly into replica lag. The takeaway: index decisions are concurrency and replication decisions, not just lookup-speed decisions.

**Q: So how many indexes should a table have? Is there a number?**

There's no magic number, but there is a reliable test: every index should trace to a known, frequent query shape, verified in the plan. A hot OLTP table typically ends up with a handful — the clustered key, the foreign-key access paths you actually join on, maybe one or two composites covering your main filters. A read-heavy reporting table tolerates more, because reads dominate the ledger. What disqualifies an index is never its count but its justification: "someone might query by channel someday" is not a justification, it's a standing write-tax with no payer. When asked this in an interview, resist quoting a number; describe the accounting instead — reads saved versus writes taxed, storage, memory, and replica cost — and how you measure each side.

## 6. The Traps — What Goes Wrong in Production

**Trap 1: Indexing every column defensively "because indexes make things faster."**

Wrong assumption: indexes are one-directional — they speed things up and cost nothing, so more is safer than fewer. Why it's wrong: each index is a live sorted copy of its slice of the table, and every insert, delete, and affected update must modify every copy, generate WAL for the change, and store the structure forever. Indexing every column doesn't make reads faster — the planner only ever consults indexes matching actual query shapes — it makes *every write* slower while multiplying storage, buffer-pool pressure, and replica lag. What actually happens: the team adds eight indexes to an events table, nothing degrades for months, then insert latency creeps up until the write path becomes the system bottleneck, batch jobs time out, and nobody suspects indexes because they were installed during a period of health. The fix: treat every index as a subscription billed per write. Add an index only for a demonstrated query shape, confirm the plan uses it, audit scan counts regularly, and delete the defensive ones before they delete your throughput.

**Trap 2: Believing only INSERTs and DELETEs pay the index tax.**

Wrong assumption: "my table is insert-heavy but rows are immutable, so indexes are cheap here." Why it's wrong: updates rewrite index entries whenever an indexed column changes — and in PostgreSQL specifically, the HOT-update optimization that skips index maintenance *only* applies when no indexed column was modified, so indexing `status` or `updated_at` turns every routine update into full index churn across every index touching those columns. What actually happens: a workflow that flips `status` from `pending` to `shipped` on ten million rows suddenly takes hours and floods replicas, because three indexes contained `status`. The fix: index immutable-ish columns freely, but index mutable state columns only with a proven read that needs them — and prefer narrow indexes so fewer updates collide with them.

**Trap 3: Adding the index and never checking whether it's used.**

Wrong assumption: creating an index automatically upgrades the queries it matches. Why it's wrong: the planner decides, and it declines indexes wrapped in functions (`WHERE DATE(created_at) = ...`), indexes whose column order doesn't match the predicate, and indexes whose selectivity is hopeless — each refusal silent unless you look. What actually happens: the migration ships, the endpoint stays slow for months, and the team concludes "indexes didn't help this table" when in fact the index was never consulted once. The fix: make "the index's name appears in `EXPLAIN` output" the mandatory acceptance criterion for every indexing change — the habit taught on the [EXPLAIN](what-is-explain.md) page — and let usage statistics catch the ones that slip through.

**Trap 4: Cleaning up unused indexes carelessly.**

Wrong assumption: `idx_scan = 0` means safe to drop, immediately. Why it's wrong: usage counters reset on restart and say nothing about periodic workloads — a monthly reconciliation job or quarterly export can depend entirely on an index that shows zero scans 51 weeks a year; meanwhile primary-key and UNIQUE-constraint indexes show scans but exist to enforce correctness, not speed, and must never be dropped as "unused." What actually happens: someone purges "dead weight" on a Friday, Monday's month-close job runs a full-table scan per lookup, and the cleanup causes the outage. The fix: observe across a complete business cycle, exclude constraint-backing indexes by definition, drop with non-blocking DDL during low traffic, keep the re-create script staged, and roll the removal out table by table rather than as one purge.

**Trap 5: Forgetting replicas pay for every index too.**

Wrong assumption: index cost is local to the primary. Why it's wrong: every index modification produces WAL/binlog records that replicas must replay, so an index multiplies replication volume, not just primary write work. What actually happens: a backfill script runs fine against the primary, then dashboards served by replicas serve stale data for hours because the replay of millions of index-maintenance records put followers hours behind. The fix: budget replication lag as part of the cost of any write-amplifying change — batch backfills, run them off-peak, and monitor `seconds_behind_master` (MySQL) or replication lag views (Postgres) during and after the operation.

## 7. Compare With Related Concepts

**When indexes hurt vs [how indexes improve performance](how-does-an-index-improve-query-performance.md).** These are two halves of one ledger, not competing claims. The benefits page explains the mechanism that makes reads fast — sorted structure, logarithmic lookup, no full scans. This page explains the invoice attached to that mechanism — a second sorted copy maintained on every write, occupying storage and cache, forever. Neither page is optional: an engineer who only knows the benefits adds five defensive indexes; one who only knows the costs fears indexes and ships unindexed 200ms queries. Rule: reads decide whether an index earns its place, writes pay for it — count both sides per table before adding or removing anything.

**Single-column indexes vs [composite indexes](what-is-a-composite-index.md) on write-heavy tables.** The write-friendly instinct is "one small index per filtered column," but that's usually backwards. Three single-column indexes mean three maintained structures, and a query filtering `WHERE customer_id = ? AND status = ?` can effectively use only one of them, leaving the rest of the filtering to post-fetch work. One composite `(customer_id, status)` is a *single* structure that serves both that query and any query touching `customer_id` alone — less total maintenance than the pair, better plans. The caveat: composite entries are wider (more bytes per row to move on writes), and they only serve leftmost-prefix queries. Rule: consolidate related filters into one well-ordered composite rather than scattering single-column indexes — and drop any single-column index that's a prefix of a composite you keep.

**Regular indexes vs [covering indexes](what-is-covering-index.md) on the read side.** A normal index finds the matching rows, then pays a hop to the table for the remaining columns; a covering index stores the extra columns right in the index entries, so hot reads never touch the table at all. That's a massive read win — and a precise write cost: those extra columns ride along in every entry, so every insert is heavier and every update to a covered column rewrites entries in that index even if the indexed key itself didn't change. Covering turns "index the filter columns" into "index the filter columns *plus the payload*," which multiplies both width and churn. Rule: reserve covering for your one or two hottest, latency-critical queries — prove the win with `EXPLAIN ANALYZE` showing the table access gone — never as a general strategy.

## 8. 🧠 The Memory Hook

An index isn't a free speedup — it's another sorted card catalog that someone must hand-file on every single change. Five indexes means every insert writes six things, forever; so before adding one, ask who reads it — and before keeping one, ask who *has* been reading it.
