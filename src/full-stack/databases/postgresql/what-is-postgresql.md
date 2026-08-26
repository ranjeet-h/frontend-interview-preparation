# What is PostgreSQL

## 1. The Real-World Problem — When You Actually Hit This

You shipped v1 with something simple. Maybe SQLite for the prototype, MySQL because the tutorial used it, or MongoDB because the data felt loose and you wanted to move fast. It worked while you had a few thousand users.

Then real life hits. One feature needs strict money handling — transfers that must either fully succeed or fully fail, no half-writes. Another feature needs to store flexible user preferences as JSON and still query them fast. A third feature needs to find every store within 2km of the user. And your analytics table just crossed 80 million rows and your nightly `DELETE` + `UPDATE` workload made queries slow down for no obvious reason.

Now you are juggling three different databases to cover what should be one reliable core, and you are paying for it in operational complexity. This is the exact gap PostgreSQL was built for. It starts as a rock-solid relational database that takes correctness seriously, then lets you add the extras — JSON, geospatial, custom types, extensions — without leaving that safe core.

If you answer "PostgreSQL is an open-source relational database" you are not wrong, but you missed everything an interviewer actually wants to hear.

> **Boundary note:** This page is the overview — what PostgreSQL is and why you would pick it. For the deep mechanics, read the focused siblings: [MVCC](./what-is-mvcc.md) and [Vacuum / Autovacuum](./what-is-vacuum.md) for concurrency and cleanup, [JSONB](./what-is-jsonb.md) and [JSON vs JSONB](./json-vs-jsonb.md) for semi-structured data, [Partitioning](./what-is-partitioning-in-postgresql.md) for huge tables, [PostGIS](./what-is-postgis.md) for geospatial, [Streaming Replication](./what-is-streaming-replication.md) and [Logical Replication](./what-is-logical-replication.md) for copies and scale-out, and [PgBouncer](./what-is-connection-pooling-with-pgbouncer.md) for connection costs.

## 2. The Analogy — Make the Mechanic Obvious

Think of PostgreSQL as a city records office.

The foundation is a proper archive. Every record has a fixed place, a clear shape, and strict rules. You cannot file a birth certificate without a name and date. You cannot file two properties with the same deed number. If you are moving a property from one owner to another, either every ledger updates or none of them does. That is the relational, ACID core — tables, types, constraints, transactions.

Most town archives stop there. You need something extra, you drive to a different building.

PostgreSQL built the archive so you can add certified specialist wings without rebuilding the whole office. Need to handle maps and distances? The PostGIS wing is added and now every clerk knows what a point, polygon, and "within radius" means. Need to store flexible JSON blobs? The JSONB wing handles it but still under the same security, backup, and transaction rules. Need a new kind of data entirely? You can register a new type or operator and the archive treats it as first-class.

Two other mechanics make the analogy accurate. First, the photocopier rule. When someone is reading a file, PostgreSQL does not lock the drawer. It hands them a snapshot copy from the moment they started reading, while writers keep working on the real file. Readers never block writers, writers never block readers. That is MVCC. The cost is that old copies pile up as waste paper and someone has to recycle them — that is vacuum. Second, the reception desk rule. Every visitor gets their own dedicated clerk (a process) who stays with them the whole visit. Great for isolation, expensive if 5,000 people walk in at once. That is why you put a smart queue manager in front — PgBouncer.

So the mental picture is: strict archive at the center, pluggable specialist wings, snapshot copies so readers and writers do not fight, and a front desk that needs pooling at scale.

## 3. The Full Explanation — How It Actually Works

PostgreSQL is an open-source object-relational database. That mouthful just means it is relational first — you model data as tables, rows, and relationships, query with SQL, and rely on ACID guarantees — but it also lets you extend what "a type" or "an index" or "a function" means.

Start with the core that never changes. You get a real type system. Not just integers and strings, but UUIDs, timestamps with time zones, network addresses, arrays, ranges, JSONB, and you can define your own. You get constraints that the database enforces, not just your app: primary keys, foreign keys, unique, check, not-null, exclusion. You get transactions that are atomic, consistent, isolated, and durable. You get joints, window functions, CTEs, and a planner that is honest about cost.

On top of that core, PostgreSQL has a few ideas that make it different from MySQL or SQLite in practice.

**MVCC and snapshot isolation.** When a transaction starts, it sees a snapshot of the data from that moment. Other transactions can keep writing new row versions alongside the old ones. Reads do not wait for writes. This is why PostgreSQL handles mixed read-write workloads so smoothly at default isolation. The trade is that old row versions remain as dead tuples until vacuum reclaims them. Updates are effectively "write a new version and mark the old one dead." Heavily updated tables will bloat without regular vacuuming, and autovacuum exists to do that automatically — but you still have to understand it, tune it, and watch for table bloat and transaction ID wraparound.

**Rich types and JSONB.** You are not forced to choose between "strict relational" and "flexible document." A common pattern is to keep the relational spine strictly typed — users, orders, payments — and use a `JSONB` column for the parts that are genuinely flexible, like user preferences or product attributes. JSONB stores JSON in a binary, indexed form. With a GIN index you can query inside the JSON without scanning every row. That is not the same as MongoDB, because the JSON lives inside a transactional row with constraints and joins. For the trade-offs and indexing detail, see the dedicated [JSONB](./what-is-jsonb.md) page.

**Extensibility.** This is the superpower. PostgreSQL lets you add extensions that feel native, not bolted on. `CREATE EXTENSION postgis;` and suddenly you have geometry types, spatial indexes, and `ST_DWithin` queries. `CREATE EXTENSION pgcrypto;` and you have `gen_random_uuid()`. You can add custom types, operators, indexes, and even procedural languages. This is why one PostgreSQL cluster can cover use cases that otherwise need three separate stores. The cost is that extensions are powerful and need review — you do not install them blindly in production.

**PostGIS.** Worth calling out because it is the clearest example of extensibility done right. If your app touches maps, routes, or "nearby" queries, PostGIS makes PostgreSQL a genuine geospatial database with GiST-indexed geometry and geography types. You do not need a separate geo store for most products.

**Partitioning.** When a single table grows into hundreds of millions of rows, you split it logically without changing the app much. Declarative partitioning by range, list, or hash lets you create something like `orders_2026_01`, `orders_2026_02` under one parent `orders` table. Queries that filter on the partition key get pruned to the right child, old partitions can be detached and dropped in milliseconds, and vacuum and indexing work on smaller pieces. Without the right partition key and pruning, you just have many small slow tables.

**Replication.** PostgreSQL ships two main stories. Streaming (physical) replication copies the whole cluster byte-for-byte to a standby for high availability and read scale. Logical replication copies specific tables or databases at the row level, even between different PostgreSQL versions or to select subscribers. Both give you read replicas and disaster recovery, but neither is automatic failover by itself — you need tooling like Patroni or managed-service automation to promote a standby safely.

**The honest costs.** Two things surprise people moving from MySQL. First, connections. PostgreSQL uses a process per connection, not a thread. Each connection costs real memory and fork overhead. Opening a fresh connection per HTTP request will kill you at scale. In production you put PgBouncer or a similar pooler in front and keep the app's pool small. Second, vacuum. Because MVCC keeps old versions around, you must let autovacuum do its job and monitor it. Long-running transactions that hold the horizon, aggressive updates without tuning, or turning autovacuum off are how people get table bloat, slow queries, and eventually transaction ID wraparound panics. These are not flaws — they are the price of snapshot isolation without read locks.

Around all this, PostgreSQL is strict about security and observability in ways that matter for backend work. Roles and row-level security policies live in the database, not just in app code. `EXPLAIN ANALYZE` tells you what the planner actually did, not what you hoped. And because it is so extensible, you can add things like pg_stat_statements to see real query costs in production.

## 4. See It In Practice — Real Code or Queries

All examples below are PostgreSQL SQL. Run them in `psql` or any PostgreSQL client. They assume PostgreSQL 14+.

A typical modern table — strict columns plus a flexible JSONB column:

```sql
-- Strict spine, flexible edges
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  prefs       JSONB NOT NULL DEFAULT '{}'::jsonb,
  tags        TEXT[] NOT NULL DEFAULT '{}'
);

-- GIN index so queries inside JSONB do not scan the whole table
CREATE INDEX users_prefs_gin ON users USING GIN (prefs);

-- Query inside JSONB and use the index
SELECT id, email
FROM users
WHERE prefs @> '{"theme":"dark"}';

-- Query an array column
SELECT id FROM users WHERE 'beta' = ANY(tags);
```

Extensibility and PostGIS — adding a wing to the archive:

```sql
-- One-time per database
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Now geography and spatial functions exist natively
CREATE TABLE stores (
  id   BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  geom GEOGRAPHY(Point, 4326) NOT NULL
);

CREATE INDEX stores_geom_idx ON stores USING GIST (geom);

-- Find stores within 2km of a point (longitude, latitude)
SELECT id, name
FROM stores
WHERE ST_DWithin(geom, ST_MakePoint(77.59, 12.97)::geography, 2000);
```

Declarative partitioning — splitting a large table without splitting the app:

```sql
-- Parent table partitioned by time
CREATE TABLE orders (
  id         BIGSERIAL,
  user_id    UUID NOT NULL,
  amount     NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Children hold specific ranges; queries pruned to the right child
CREATE TABLE orders_2026_q1 PARTITION OF orders
  FOR VALUES FROM ('2026-01-01') TO ('2026-04-01');

CREATE TABLE orders_2026_q2 PARTITION OF orders
  FOR VALUES FROM ('2026-04-01') TO ('2026-07-01');

-- App still writes to the parent; PostgreSQL routes the row
INSERT INTO orders (user_id, amount, created_at)
VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 499.00, '2026-02-14T10:00:00Z');

-- This query only touches the q1 partition thanks to constraint exclusion
SELECT * FROM orders WHERE created_at >= '2026-02-01' AND created_at < '2026-03-01';
```

Connection and replication reality — what production actually looks like:

```sql
-- See why you need a pooler: each row is a backend process
SELECT pid, usename, application_name, state, query_start
FROM pg_stat_activity
ORDER BY query_start;

-- See table bloat and whether vacuum is keeping up
SELECT relname, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_all_tables
WHERE schemaname = 'public'
ORDER BY n_dead_tup DESC;

-- Quick check that autovacuum is on (it should be in production)
SHOW autovacuum;
```

For replication, the SQL is not enough — it is configuration. Streaming replication is set in `postgresql.conf` and `pg_hba.conf` on primary and standby, logical replication uses `CREATE PUBLICATION` on the source and `CREATE SUBSCRIPTION` on the target. Both pages cover the exact commands: [Streaming Replication](./what-is-streaming-replication.md) and [Logical Replication](./what-is-logical-replication.md).

## 5. Interview Questions — All of Them, Done Properly

**Q: What is PostgreSQL, beyond the one-line definition?**

It is an open-source object-relational database. Relational means your data lives in tables with strict types, constraints, and relationships, queried with SQL and protected by ACID transactions. Object-relational means you can extend it — add new types, operators, index methods, and extensions like PostGIS — and they behave as if they were built in. The reason it matters is that you get the safety of a strict core plus the flexibility to handle JSON, geospatial, and huge tables without bolting on a second database for every new shape of data.

**Q: Why choose PostgreSQL over MySQL?**

Choose based on what you need to be great at. Pick PostgreSQL when you want strict correctness by default, richer types and constraints, extensibility through real extensions, advanced indexing like GIN and GiST, and snapshot isolation where readers do not block writers. MySQL with InnoDB is fast, operationally simple, and excellent for high-throughput primary-key lookups at scale — which is why many large high-read workloads stay on it. If your answer is "PostgreSQL is better at everything" you missed the trade.

**Q: What is MVCC in PostgreSQL and why does it matter?**

Multi-Version Concurrency Control means PostgreSQL keeps multiple versions of a row. When a transaction starts, it sees a snapshot of committed data from that moment. Other transactions can write new versions without blocking the reader. That is why reads do not block writes and writes do not block reads under the default isolation level. The cost is that old row versions become dead tuples that must be cleaned up by vacuum. If you hold a long transaction open, you hold the snapshot horizon and prevent cleanup, which causes bloat.

**Q: What is JSONB and when would you use it over a normal column or a separate document store?**

JSONB is a binary JSON type that stores JSON in a parsed, indexable form inside a regular row. Use it when a small, genuinely flexible part of your model benefits from a schema-on-read feel — like user preferences, plugin settings, or product attributes — while the rest of the row stays strictly typed and transactional. You add a GIN index and queries like `prefs @> '{"theme":"dark"}'` become index lookups. Do not use JSONB as an excuse to skip data modeling. If you find yourself querying or joining on the same JSON path everywhere, promote it to a real column.

**Q: What is the connection model and why does everyone mention PgBouncer with PostgreSQL?**

PostgreSQL gives each client connection its own backend process. That process has memory and state and is heavier than a MySQL thread. If every HTTP request opens a new connection, you will hit limits fast and see high latency from fork overhead. PgBouncer is a lightweight pooler that sits between your app and PostgreSQL and reuses a small number of real connections across many app requests, usually in transaction-pooling mode. The fix is not "increase max_connections to 500" — it is "keep a small pool and reuse it."

**Q: What is vacuum and autovacuum? Why can't I just ignore them?**

Because MVCC keeps old row versions around, `UPDATE` and `DELETE` leave dead tuples behind. Vacuum scans pages and marks that space reusable; full vacuum can also compact files. Autovacuum is the background worker that does this automatically based on how much churn a table has seen. If you disable it, run very long transactions, or tune it too lazily for a hot table, the table bloats, indexes bloat, queries slow down, and in the extreme case you risk transaction ID wraparound where the database stops taking writes to protect itself. You should monitor `n_dead_tup` and `last_autovacuum` and tune per-table settings for hot tables. See [Vacuum](./what-is-vacuum.md) and [Autovacuum](./what-is-autovacuum.md).

**Q: What is partitioning and when should you use it?**

Partitioning splits one logical table into physical children — by range, list, or hash — under a single parent. Use it when a table is huge, when you regularly query or drop by a natural boundary like time or region, or when vacuum and indexing on one giant table becomes painful. It helps with pruning, bulk deletes, and maintenance. It does not magically speed up a query that does not filter on the partition key. If you partition by `created_at` but most queries filter by `user_id` alone, you will still hit every partition.

**Q: What is PostGIS?**

An extension that turns PostgreSQL into a serious geospatial database. After `CREATE EXTENSION postgis` you get geometry and geography types, spatial indexes via GiST, and functions like `ST_DWithin`, `ST_Contains`, and `ST_Distance`. Most product needs — "find nearby," "is this point inside a delivery zone" — are solved without a separate geo store. It is the best example of why people say PostgreSQL is extensible rather than just feature-rich.

**Q: How does replication work in PostgreSQL?**

Two modes. Streaming (physical) replication ships WAL bytes from primary to standby and keeps a byte-identical copy for high availability and read scaling. Logical replication ships row changes for selected tables or databases and can cross versions or filter what is replicated. Neither is a one-click "always correct after failover" guarantee. You need health checks, controlled promotion, and fencing to avoid split-brain. See [Streaming Replication](./what-is-streaming-replication.md) and [Logical Replication](./what-is-logical-replication.md).

**Q: Is PostgreSQL good for everything? When would you not use it?**

Not for everything. If you need ultra-high write fanout with eventually consistent counters or a truly elastic document model with no joins, a purpose-built store may fit better as a complement — not necessarily a replacement. If you need in-memory speed for caches, queues, or leaderboards, you pair PostgreSQL with Redis rather than forcing PostgreSQL to behave like Redis. The senior answer is that PostgreSQL is the excellent default for transactional and analytical relational data, and you add specialized stores alongside it for specific jobs.

## 6. The Traps — What Goes Wrong in Production

**Treating PostgreSQL like MySQL.** Teams copy MySQL defaults — opening hundreds of connections, relying on thread-light behavior, or expecting `INSERT ... ON DUPLICATE KEY UPDATE` — and get burned. PostgreSQL wants a small pooled connection count, `ON CONFLICT` for upserts, and explicit thought about vacuum. Copying habits across engines without checking semantics causes silent correctness and performance bugs.

**Opening a new connection per request.** Works on localhost. Dies at 2,000 concurrent users. Latency spikes, `too many connections` errors, and OOM on the database host. Fix it with PgBouncer in transaction mode and a modest app pool size. Do not raise `max_connections` as the first fix.

**Using JSONB as a document dump.** One team puts the entire domain model in a single `data JSONB` column because it feels fast to ship. Then every report needs `data->>'status'` with a full scan because no GIN index exists, and the app cannot enforce a simple NOT NULL. JSONB is for the flexible fringe. Promote hot, queried fields to real columns with real constraints.

**Forgetting that UPDATE creates a new row version.** A job that "touches" every row nightly — even with the same value — creates a full copy of the table in dead tuples. Autovacuum falls behind, bloat grows, and sequential scans get slower even though `COUNT(*)` looks same. Batch updates, add `WHERE` that actually filters, and monitor `n_dead_tup`.

**Long-running transactions holding the horizon.** A forgotten `psql` session with `BEGIN; SELECT ...` and no commit, or an app transaction that hangs open for minutes, prevents vacuum from cleaning any table touched since that snapshot started. Bloat spreads from that one hold. Set `idle_in_transaction_session_timeout`, close transactions quickly, and alert on old `xact_start` in `pg_stat_activity`.

**Partitioning without pruning.** Creating 48 monthly partitions and then querying `WHERE user_id = $1` with no time filter touches all 48. You added complexity and got no speed. Partition by what you filter and maintain by, and confirm pruning with `EXPLAIN`.

**Assuming replication is failover.** Having a standby does not mean you have high availability. Without promotion automation and client redirection, a primary failure still means downtime. Streaming replication copies bytes; it does not reroute your app.

**Leaving autovacuum at defaults for a hot table.** A queue-like table with heavy churn needs more aggressive vacuuming than a mostly static `users` table. If autovacuum cannot keep up, schedule manual `VACUUM ANALYZE` or tune per-table thresholds. Watch `last_autovacuum` — if it is days old on a churning table, you already have a problem.

## 7. Compare With Related Concepts

**PostgreSQL vs MySQL — the one-line rule.** If you want extensibility, strict correctness, and rich query power in one cluster, choose PostgreSQL; if you want operational simplicity and raw high-throughput primary-key serving at massive read scale, MySQL with InnoDB is the strong alternative — pick based on the workload, not on habit. For a fuller comparison with storage engine and operational detail, see [PostgreSQL vs MySQL](./postgresql-vs-mysql.md).

**PostgreSQL vs MongoDB.** PostgreSQL keeps JSON inside a transactional, relational row — you get JSON flexibility plus joins, constraints, and ACID. MongoDB is a document-native store with different scaling and consistency trade-offs. If the flexible data is a small part of a relational domain, PostgreSQL's JSONB is often enough. If the entire product is document-shaped with weak relational needs, MongoDB may fit better.

**PostgreSQL vs SQLite.** SQLite is a single-file, zero-ops database that is perfect for dev, mobile, or embedded use. It is not a concurrent production server for a multi-user backend. When you need real concurrent writes, distinct roles, replication, and horizontal read scale, you move to PostgreSQL.

**PostgreSQL JSON vs JSONB.** `JSON` stores the original text and validates it; `JSONB` stores a binary form that is slightly slower to write but much better to query and index. For any backend workload that filters inside JSON, use `JSONB` with a GIN index. The sibling page [JSON vs JSONB](./json-vs-jsonb.md) walks through the exact trade.

**PostgreSQL extensibility vs a new database.** Adding an extension keeps data, transactions, auth, and backup under one roof. Adding a new database multiplies operational cost — more backups, more failure modes, more auth. Prefer an extension until a workload clearly needs a separate system.

## 8. 🧠 The Memory Hook

PostgreSQL is the strict archive that learned to say yes — a rock-solid relational core where readers never block writers, and every new superpower is just another certified wing bolted onto the same safe building.
