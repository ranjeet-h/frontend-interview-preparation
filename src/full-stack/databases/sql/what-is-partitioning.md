# What Is Partitioning

## 1. The Real-World Problem — When You Actually Hit This

Your app has an `events` table. Clicks, page views, API calls — everything gets appended there. It's been fine for two years. Then it crosses a few terabytes and two things start happening at once.

First, every query that touches recent data crawls, even simple ones. The database keeps having to wade through years of rows it doesn't care about to find last Tuesday's.

Second — and this is the one that ruins someone's week — your retention policy says "delete events older than 12 months." So someone runs:

```sql
DELETE FROM events WHERE event_time < NOW() - INTERVAL '12 months';
```

and this runs for hours. It locks chunks of the table as it goes, generates a mountain of write-ahead log, replication falls behind, autovacuum falls further behind trying to clean up the dead rows, and if anyone cancels it halfway, you've paid the entire cost and kept none of the progress. You did all that work just to throw data away.

Partitioning exists precisely because both of these pains come from the same root cause: the database treats your table as one giant pile, so every operation — reads, deletes, maintenance — has to consider the whole pile. Partitioning says: split the pile into labeled chunks up front, and suddenly whole chunks can be skipped or thrown away without looking inside them.

## 2. The Analogy — Make the Mechanic Obvious

Think of a filing cabinet in your office that holds every letter the company has ever received, in no particular order. Two jobs are miserable: finding "all letters from July," because someone has to flip through every letter in the cabinet; and destroying "all letters older than a year," because someone has to read each letter, check its date, shred the old ones, and re-file the rest — while everyone else stands around waiting to use the cabinet.

Now replace it with the same cabinet, but fitted with hanging folders labeled by month, plus a mailroom clerk. Every incoming letter goes straight into the folder matching its date. Finding letters from July means opening exactly one folder. Destroying last year's letters doesn't mean shredding sheets — you pull out twelve folders and carry them to the dumpster in one trip. And each folder can have its own index tabs, so searching within a month stays quick even as the cabinet grows.

Every part maps to the real mechanic:

- The cabinet is still one cabinet in one room — one logical table on one server. Nothing moved to another building.
- The monthly folders are the partitions: separate physical storage chunks behind one table name.
- The mailroom clerk routing letters by date is the database engine automatically sending each INSERT to the right partition based on the key.
- Opening only the July folder is partition pruning — the query planner looks at your `WHERE` clause and skips partitions whose date ranges can't possibly match.
- Pulling folders out instead of shredding sheets is `DROP PARTITION` versus `DELETE`.
- Index tabs inside each folder are per-partition indexes — small, local, and cache-friendly.

One deliberate limit of the analogy: the clerk files letters by *date* here, but the folder rule could be anything — by office location, by sender category, or just spread evenly. Those are the different partition types coming up next.

## 3. The Full Explanation — How It Actually Works

In plain words: you tell the database "split this table into pieces using a rule based on some column." After that, you keep querying and inserting through the single original table name as always. Under the hood, the engine routes every row into the right piece and reads from only the pieces it needs.

The pieces are real, separate physical storage — each one behaves like its own table with its own indexes and its own statistics — but they're bound together under one parent table on the same server. That last part is the definition line people miss: partitioning never leaves one machine. If pieces live on multiple machines, you've moved to sharding, which is a different tool with distributed-systems costs attached.

You pick one of three splitting rules:

- **Range** — each partition owns a contiguous span of values: July's dates in one partition, August's in the next; or user IDs 1–1M, then 1M–2M. By far the most common choice for time-series and event data, because time flows forward and old data expires cleanly.
- **List** — each partition owns an explicit set of values: EU customers in one partition, US in another; or orders with status `completed` separated from everything else. Good when data naturally sorts into known categories rather than ordered spans.
- **Hash** — no natural range or category? Hash the key and distribute rows evenly across N partitions. You don't get meaningful pruning ("which partition holds user 42?" has no human answer), but you get smaller independent chunks, which spreads I/O and makes maintenance operate on bite-size pieces instead of one monster.

Here's the mechanic that does the actual work: **partition pruning**. When a query arrives, the planner examines the `WHERE` clause before touching any data. If you wrote `WHERE event_time >= '2026-08-01' AND event_time < '2026-09-01'`, the planner knows August's range can't hide in the January partition, so that partition never gets opened at all — not "scanned quickly," but genuinely skipped, usually visible in the query plan as only one or two partitions listed where dozens exist. This is also the honest answer to "does partitioning make queries faster?" — it makes *queries that filter on the partition key* faster, sometimes dramatically. A query with no filter on the partition key must visit every partition, which can actually be slower than one plain unpartitioned table, because the planner pays overhead checking each piece.

Then the second headline benefit: **data expiry becomes a metadata operation**. With a range-partitioned events table, "delete everything older than 12 months" becomes `DROP TABLE events_2024_08` (or `DETACH PARTITION`, which removes it from the parent while keeping the data for archiving). Dropping a partition is nearly instant regardless of whether it holds ten rows or ten billion — the engine drops the storage reference; it never walks rows. No hours-long DELETE, no lock storms, no vacuum debt, no replication lag spike. This alone justifies partitioning for most high-volume time-series tables.

Per-piece independence is the quieter benefit. Each partition carries its own indexes, so a hot recent-months index stays small enough to live comfortably in cache, instead of one gigantic B-tree where lookups degrade as the tree grows. Maintenance also shrinks: vacuuming, analyzing, reindexing happen per partition, so instead of one multi-hour maintenance job over terabytes, you have many short jobs over gigabytes — and they mostly touch the partitions receiving writes, not the cold history.

Now the rule that surprises everyone: **in PostgreSQL and MySQL, the primary key (and any unique constraint) must include the partition key column(s)**. There's a real reason, not bureaucracy. Uniqueness is enforced with a local index inside each partition — there's no global index spanning all pieces. If your unique key didn't include the partition column, the engine would have no idea which piece might already hold a conflicting value and would have to check every partition on every insert. Include the partition key, and the engine computes exactly which partition a row belongs to, checks uniqueness locally, and done. Practical consequence: you cannot partition an `events` table by `event_time` and *also* guarantee globally-unique `event_id` via the primary key — either the key becomes `(event_id, event_time)`, which tolerates a duplicate id across months, or uniqueness moves elsewhere. Related dialect note: MySQL goes further and forbids foreign keys on partitioned InnoDB tables entirely; Postgres supports them but full support landed gradually across versions 11–12, so check your version before designing around it.

When does partitioning pay for itself, versus being complexity you don't need? It earns its keep when at least one of these is true: data expires in bulk by age, queries predictably filter on a key like time or tenant, the table is large enough that routine maintenance (vacuum, backups, index rebuilds) hurts, or archival needs mean "detach and move to cheap storage." It's pure overhead when the table fits comfortably on one machine, queries rarely filter on the partition key, or you need global uniqueness the partition key can't be part of. A good senior instinct: partitioning solves *operational* pain — deletion, maintenance, chunk-skipping — more than it solves raw lookup speed. For raw lookup speed you want an index, and the two compose.

## 4. See It In Practice — Real Code or Queries

**PostgreSQL — the canonical setup (Postgres syntax, version 10+):**

```sql
-- One logical table, physically split by month of event_time.
CREATE TABLE events (
    id          bigint,
    user_id     bigint NOT NULL,
    action      text   NOT NULL,
    event_time  timestamptz NOT NULL,
    PRIMARY KEY (id, event_time)   -- partition key MUST be in the PK; see section 3
) PARTITION BY RANGE (event_time);

-- Each piece owns a half-open range: [start, end).
CREATE TABLE events_2026_07 PARTITION OF events
    FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE events_2026_08 PARTITION OF events
    FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE events_2026_09 PARTITION OF events
    FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Inserts go through the parent; the engine routes each row.
INSERT INTO events (user_id, action, event_time)
VALUES (42, 'page_view', '2026-08-14T10:22:00Z');  -- lands in events_2026_08

-- An index declared on the parent cascades to every partition,
-- so each piece gets its own small B-tree.
CREATE INDEX idx_events_user ON events (user_id);
```

Prove pruning is happening with `EXPLAIN`. Filter on the partition key and the plan mentions only the surviving partition; drop the filter and the plan lists every partition under an `Append` node:

```sql
EXPLAIN SELECT count(*) FROM events
WHERE event_time >= '2026-08-01' AND event_time < '2026-09-01';
-- Plan shows a scan of ONLY events_2026_08 -- July and September never opened.

EXPLAIN SELECT count(*) FROM events;
-- Plan shows an Append scanning events_2026_07, _08, _09 ... every piece.
```

Expiry as a metadata operation instead of an hours-long `DELETE`:

```sql
-- Archive: detach keeps the data as a standalone table you can move to cheap storage.
ALTER TABLE events DETACH PARTITION events_2024_08;

-- Or destroy outright: near-instant no matter how many billions of rows it held.
DROP TABLE events_2024_08;
```

**MySQL — same idea, slightly different spelling (MySQL syntax):**

```sql
CREATE TABLE events (
    id          BIGINT NOT NULL,
    user_id     BIGINT NOT NULL,
    action      VARCHAR(64) NOT NULL,
    event_time  DATETIME NOT NULL,
    PRIMARY KEY (id, event_time)   -- same rule: every unique key must include the partition column
)
PARTITION BY RANGE COLUMNS (event_time) (
    PARTITION p2026_07 VALUES LESS THAN ('2026-08-01'),
    PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
    PARTITION p_future VALUES LESS THAN (MAXVALUE)  -- catch-all; see traps
);

ALTER TABLE events DROP PARTITION p2026_07;  -- expiry: instant, no row-by-row delete

-- Check pruning via the `partitions` column in EXPLAIN output:
EXPLAIN SELECT count(*) FROM events WHERE event_time >= '2026-08-01' AND event_time < '2026-09-01';
```

**Runnable demo — the mechanic emulated in SQLite.** SQLite has no declarative partitioning (`psql`/`mysql` aren't needed to feel the concept, though). You can build the shape manually: one leaf table per chunk, glued together by a view. Run this with `sqlite3 :memory:` — the plan output below is real:

```sql
CREATE TABLE events_2026_07 (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    event_time TEXT NOT NULL CHECK (event_time >= '2026-07-01' AND event_time < '2026-08-01')
);
CREATE TABLE events_2026_08 (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    event_time TEXT NOT NULL CHECK (event_time >= '2026-08-01' AND event_time < '2026-09-01')
);
INSERT INTO events_2026_07 (user_id, action, event_time) VALUES (1, 'click', '2026-07-15');
INSERT INTO events_2026_08 (user_id, action, event_time) VALUES (2, 'click', '2026-08-02');

CREATE VIEW events AS
    SELECT * FROM events_2026_07 UNION ALL
    SELECT * FROM events_2026_08;

EXPLAIN QUERY PLAN SELECT * FROM events WHERE event_time LIKE '2026-08%';
```

Real output:

```txt
QUERY PLAN
`--COMPOUND QUERY
   |--LEFT-MOST SUBQUERY
   |  `--SCAN events_2026_07
   |--UNION ALL
   |  `--SCAN events_2026_08
```

That's the lesson in six lines: the naive view must open **both** leaf tables even though the answer lives entirely in August — this is exactly what declarative partitioning plus pruning fixes. The planner in Postgres/MySQL looks at the literal range in your predicate and eliminates `events_2026_07` from the plan before executing anything. Query a leaf table directly and SQLite scans one table:

```txt
QUERY PLAN
`--SCAN events_2026_08
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is partitioning, in one clear explanation?**

It's splitting one logical table into multiple physical pieces according to a rule on a chosen column — the partition key — while every read and write still goes through the single original table name. The engine routes inserts to the right piece automatically, and the query planner skips pieces that can't match a query's filters. All pieces stay on the same server; the moment pieces move to separate machines, it's sharding. The two problems it primarily solves are bulk data expiry (drop a piece instead of deleting millions of rows) and keeping large tables maintainable by operating on many small chunks instead of one giant one.

**Q: How is partitioning different from sharding?**

Same splitting instinct, completely different blast radius. Partitioning cuts a table into pieces that all live on *one* machine — the server's CPU, RAM, disk, and connection limits are unchanged; you've made the data more navigable and operable, not more scalable. Sharding scatters the pieces across machines, which genuinely raises capacity ceilings but imports every distributed-systems cost: cross-shard queries, scatter-gather patterns, rebalancing, partial failures. Rule of thumb: partition first to keep one machine manageable; shard only when a single machine truly cannot hold or serve the data.

**Q: What partition types exist, and how do you choose?**

Range, list, and hash. Range assigns each partition a contiguous span of the key — the default choice for time-stamped data since time moves forward and old ranges expire cleanly. List assigns explicit value sets — right when data falls into known categories like regions or tenant tiers rather than ordered spans. Hash spreads rows evenly across N partitions — used when there's no natural ordering, accepting that pruning becomes useless in exchange for uniformly sized, independently maintained chunks. Most production choices are range-by-time, occasionally hash-by-id when the goal is chunking rather than skipping.

**Q: What is partition pruning, and how do you verify it's working?**

Pruning is the planner eliminating partitions before execution by comparing the query's predicates against each partition's declared boundaries. `WHERE event_time >= '2026-08-01' AND event_time < '2026-09-01'` provably cannot match July's rows, so July's partition never opens. Verify it in the query plan: in Postgres, `EXPLAIN` lists only surviving partitions under the Append node — if you see every partition listed, pruning didn't fire. In MySQL, check the `partitions` column of EXPLAIN. Common reasons pruning silently fails: wrapping the partition column in a function (`WHERE DATE(event_time) = ...`), implicit type casts between the filter and the column type, or predicates on a different column than the partition key.

**Q: Why is dropping a partition so much faster than DELETE?**

Because they do fundamentally different amounts of work. `DELETE` finds and removes matching rows one by one: every row delete writes WAL, updates every index entry, and leaves dead tuples for vacuum to reclaim later — hours of work proportional to row count, holding locks along the way, and cancelling halfway wastes everything. Dropping a partition is a metadata operation: the engine detaches the storage file and forgets about it. The work is constant-time-ish regardless of whether the partition holds a thousand rows or ten billion. This asymmetry — O(rows) versus roughly O(1) — is the single strongest reason time-series tables get range-partitioned by retention period.

**Q: Why must the primary key include the partition key in Postgres and MySQL?**

Uniqueness is enforced locally, with an index inside each partition; there's no global index spanning the whole table. If the unique key excluded the partition column, inserting a row would require checking *every* partition for duplicates, defeating the design. Including the partition key lets the engine route the row to exactly one partition and check uniqueness with one local index lookup. The practical trade-off: `(id, event_time)` as PK permits the same `id` to appear in two different months, so true global uniqueness of `id` alone is impossible under that scheme — if you need it, enforce it upstream (a sequence/snowflake generator) or rethink the partition key.

**Q: Does partitioning make every query faster?**

No, and claiming otherwise is the classic junior answer. Partitioning speeds up queries that filter on the partition key, because pruning skips whole chunks. Queries without a partition-key filter visit every partition, and can be *slower* than the same query on one plain table, since the planner spends extra effort enumerating pieces and each piece carries its own small index to consult. Even after perfect pruning, finding specific rows inside the surviving partition still depends on ordinary indexes. Partitions decide *where not to look*; indexes decide *how to find things where you do look*. You almost always need both on big tables.

**Q: How does partitioning affect application code and frontend clients?**

Almost invisibly — that's the point. The table name, SQL interface, and result shapes are unchanged, so ORMs, APIs, and clients need zero changes. The effects show up operationally: retention jobs stop causing latency spikes, dashboards filtering by recent time windows get faster, and backup/maintenance windows shrink. The one way it leaks into app behavior is bad: if a common application query lacks the partition-key filter, that query pattern quietly degrades. So the contract change isn't in code — it's in query-review discipline: new queries against big partitioned tables should include the partition key.

**Q: When would you NOT use partitioning, and what does it cost when misapplied?**

Skip it when the table is comfortably small, when retention is handled another way, or when queries rarely filter on any sensible key. Misapplied, it actively costs you: planning overhead grows with partition count (thousands of partitions measurably slow planning), the PK-must-include-the-key rule may break a uniqueness requirement you actually need, MySQL forbids foreign keys on partitioned tables, and you inherit permanent operational chores — creating future partitions ahead of time (usually automated with something like pg_partman) and managing catch-all partitions. Partitioning is a tool for tables where size creates operational pain, not a default scaling checkbox.

**Q: What would you monitor on a partitioned table in production?**

Four things. First, partition coverage: alert when the current period's partition doesn't exist yet — inserts then land in a default/catch-all partition and you lose pruning until someone notices. Second, prune health: track plans for your hottest queries and alert when they start listing all partitions (usually caused by a newly deployed query missing the partition-key filter). Third, lock waits and replication lag during detach/drop operations, since those still take brief exclusive locks. Fourth, per-partition sizes and skew, especially under hash partitioning, where one hot key can bloat a single piece. Plain-table metrics like table size become less useful once the table fragments into pieces.

## 6. The Traps — What Goes Wrong in Production

**Queries without the partition key scan everything.** Wrong assumption: "we partitioned the table, so all our queries got faster." Why it's wrong: pruning works by matching predicates against partition bounds — no predicate on the partition key means nothing to match, so no partition can be eliminated. What actually happens: the plan turns into an Append over every partition, and with hundreds of partitions the planning itself adds noticeable overhead, making these queries potentially slower than before partitioning. The fix: audit real query traffic before choosing a key, ensure hot queries filter on it, and treat any new query on the table missing the key as a code-review flag. Prove each critical path with EXPLAIN, not hope.

**Assuming partitions are a substitute for indexes.** Wrong assumption: "the table is partitioned, we can drop the indexes." Why it's wrong: pruning picks which partition to search, but within that partition you may still have millions of rows — finding `user_id = 42` inside August's data is still a scan unless an index exists. What actually happens: after someone drops indexes, even perfectly pruned queries regress badly. Fix: think of them as layers — partitions narrow the search space coarsely, indexes navigate precisely inside it. Big partitioned time-series tables typically want both.

**Hitting the unique-constraint wall at migration time.** Wrong assumption: "partitioning is transparent, we'll add it and nothing else changes." Why it's wrong: Postgres and MySQL require every unique constraint, including the PK, to contain the partition key — uniqueness enforcement is per-piece. What actually happens: `CREATE TABLE ... PARTITION BY ...` fails outright on a table whose PK doesn't qualify, or worse, you change the PK to `(id, created_at)` and silently weaken a uniqueness guarantee your billing logic depended on. Fix: decide consciously whether per-partition uniqueness suffices, or generate ids that are globally unique by construction (sequences, snowflake IDs), or keep that particular table unpartitioned. Also remember MySQL forbids foreign keys on partitioned InnoDB tables entirely — check ORM-level assumptions too.

**The catch-all partition eating your data.** Wrong assumption: "I defined monthly partitions; rows will sort themselves out." Why it's wrong: nobody created next month's partition before its first insert arrived. What actually happens differs by dialect: in MySQL, rows beyond your largest `VALUES LESS THAN` bound error out unless you added a `MAXVALUE` partition — and if you did, they pile up silently in it; in Postgres, inserts fail unless a `DEFAULT` partition exists, and if it exists, rows land there where pruning still works but your tidy scheme is broken — and creating the proper partition later conflicts with rows already sitting in the default. Fix: automate creating future partitions well ahead of time (pg_partman or a scheduled job), monitor for rows landing in the catch-all, and make "current partition exists" a dashboard alert.

**Running the old DELETE cleanup anyway.** Wrong assumption: "partitioning is set up; the nightly cleanup script can stay." Why it's wrong: the script predates partitioning and issues row-by-row `DELETE`s against the parent table. What actually happens: you pay the full delete cost — WAL churn, vacuum pressure, lock contention — to remove rows that a single `DROP PARTITION` would have discarded instantly. Fix: replace age-based `DELETE`s with detach/drop of expired partitions, and keep `DELETE` only for surgical, small corrections.

**Thousands of tiny partitions.** Wrong assumption: "if monthly partitions help, daily-or-hourly must help more." Why it's wrong: every partition adds planning work, file handles, and lock-management surface, and each piece ends up too small to justify its own indexes. What actually happens: planning time dominates query latency, maintenance tooling slows down enumerating pieces, and operations get fragile. Fix: size partitions so each holds enough data to matter — commonly day/month granularity for large event streams — and only go finer when a single coarse partition genuinely strains maintenance windows.

## 7. Compare With Related Concepts

**Partitioning vs sharding.** Both chop a table into pieces, but partitioning keeps every piece on one server while sharding distributes pieces across machines. Partitioning improves operability — expiry, maintenance, chunk-skipping — without touching your capacity ceiling; sharding raises the ceiling but introduces cross-shard queries, rebalancing, and partial-failure handling. Rule: partition when one machine struggles to *operate* the data; shard when one machine cannot *hold or serve* it.

**Partitioning vs indexes.** An index accelerates finding rows *within* a table; partitioning decides which chunks of the table to skip *entirely*. They solve different layers of the same problem and compose freely — a pruned partition still wants indexes inside it for precise lookups. Rule: indexes for precise lookups on any column; partitions for coarse boundaries (time ranges, tenant classes) that align with how data expires and how queries filter.

**Partitioning vs manual multi-table + view (the SQLite-style emulation).** Functionally similar — leaf tables glued by UNION ALL — but manual splitting pushes routing onto application code, gives you no automatic pruning, and breaks when a query hits the view without a leaf hint. Declarative partitioning keeps one table name, routes inserts automatically, and prunes in the planner. Rule: emulate manually only when the database offers nothing better (SQLite, very old engines); otherwise let the engine do it.

## 8. 🧠 The Memory Hook — What Sticks

One filing cabinet, many hanging folders, one room. Filter by date and the clerk opens one folder; purge a year and you carry out twelve folders whole — but ask "find any letter mentioning refunds" and you're still flipping through every folder, which is what indexes are for. Partitioning never left the building: the day the folders move to other buildings, you're sharding, and life gets much more complicated.
