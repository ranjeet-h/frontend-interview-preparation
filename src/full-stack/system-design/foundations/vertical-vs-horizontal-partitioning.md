# Vertical vs Horizontal Partitioning

## 1. Why This Exists — The Problem First

Your `users` table has 47 columns. Profile bios, billing addresses, login credentials, notification preferences, GDPR consent flags — all in one wide row. The login query only needs `email` and `password_hash`, but Postgres reads the entire 4 KB row from disk every time. Indexes bloat. Cache efficiency tanks.

Meanwhile, the same table hits 800 million rows. Inserts slow down. Vacuum takes hours. Backups don't finish before the next one starts. A single Postgres instance is the ceiling.

Two different scaling moves, both called "partitioning," and candidates swap them constantly. **Vertical partitioning** splits *what columns or tables you store together*. **Horizontal partitioning** splits *which rows live on which machine*. Solve the wrong one and you've added complexity without fixing the bottleneck.

## 2. The Analogy — Make It Obvious

You have a filing cabinet stuffed with employee records.

**Vertical partitioning** is **splitting one fat folder into specialized folders**. Personal info goes in drawer A (name, address). Payroll goes in drawer B (salary, tax ID). Security clearance in drawer C. When HR needs a phone number, they open drawer A only — not the entire employee mega-folder. Same employees, different physical files by *type of data*.

**Horizontal partitioning** is **buying more filing cabinets and splitting employees across them**. Cabinet 1 holds employees A–M, cabinet 2 holds N–Z. Or by employee ID: 1–1,000,000 in cabinet 1, 1,000,001–2,000,000 in cabinet 2. Same columns in each cabinet, but *fewer rows per cabinet*. When the company grows to 10 million employees, you add cabinet 11 instead of making one drawer infinitely deep.

Vertical = split by **attribute/concern**. Horizontal = split by **volume/row range**.

## 3. How It Actually Works — The Full Explanation

### Vertical partitioning (split by columns or tables)

Take a wide table or mixed-concern schema and **separate data accessed at different rates or with different security requirements**.

**Approaches:**

1. **Column splitting** — `users` (id, email, password_hash) + `user_profiles` (user_id, bio, avatar_url, preferences). Join on `user_id` when you need both.
2. **Table splitting by concern** — billing data in `billing_db`, product catalog in `catalog_db`. Classic microservices data ownership.
3. **Hot/cold separation** — active orders in `orders_active`, archived orders in `orders_archive` (often paired with time-based horizontal strategies).

**Why it helps:**

- **Narrower rows** — login query touches small `users` table, not 47 columns
- **Different indexes** — optimize each table for its access pattern
- **Security isolation** — PII in encrypted store, public profile data elsewhere
- **Independent scaling characteristics** — profile reads are 100x login writes

**Trade-offs:**

- **Joins required** — fetching full user needs two tables (or two DB round-trips)
- **Referential integrity** — foreign keys across DBs don't work natively
- **Transactions across partitions** — harder than one table

Example from source material: user auth info vs user profile data — login path stays fast; profile edits don't lock auth rows.

### Horizontal partitioning (split by rows — sharding)

Distribute **rows** across multiple database instances using a **shard key** (partition key). Each shard holds a subset of rows with the **same schema**.

**Approaches:**

1. **Range partitioning** — user_id 1–1M on shard 1, 1M–2M on shard 2
2. **Hash partitioning** — `hash(user_id) % N` determines shard (even distribution)
3. **Geographic** — EU users on EU shard, US users on US shard (latency + compliance)
4. **Directory-based** — lookup table maps key → shard (flexible, but lookup is a SPoF)

**Why it helps:**

- **Scale writes and storage** — each shard is a fraction of total data
- **Parallel queries** — scatter-gather across shards (when query includes shard key)
- **Blast radius** — one shard's corruption doesn't kill all data (with caveats)

**Trade-offs:**

- **Cross-shard queries are expensive** — "top 10 users globally" hits every shard
- **Rebalancing** — adding shard 5 means moving data from 1–4
- **Hot shards** — bad key choice (shard by `country` when 90% users are US) creates imbalance
- **Distributed transactions** — multi-shard ACID is hard (2PC, sagas, or avoid)

Example from source material: users 1–1M in shard 1, 1M–2M in shard 2.

### When to use which

| Signal | Likely fix |
|---|---|
| Wide rows, query reads few columns | Vertical |
| Different security/compliance per column group | Vertical |
| Single table > tens/hundreds of millions of rows | Horizontal |
| Write throughput exceeds one DB node | Horizontal |
| One access pattern dominates (login) vs rare (profile) | Vertical |
| Need geographic data residency | Horizontal (geo shards) |

**In real systems, you often do both.** Shard horizontally for volume, vertically within each shard for wide tables. Horizontal is the main scale-out move for dataset size; vertical is the main move for access-pattern optimization.

### Partitioning vs sharding — terminology

In interviews, **sharding** usually means horizontal partitioning across machines. **Vertical partitioning** sometimes means splitting columns, sometimes means splitting into separate databases by domain. Be explicit about which dimension you're splitting.

## 4. Real Code — See It Working

### Vertical partitioning — split wide user table

```sql
-- Before: one wide table
CREATE TABLE users (
    id          BIGSERIAL PRIMARY KEY,
    email       TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    bio         TEXT,
    avatar_url  TEXT,
    preferences JSONB,
    created_at  TIMESTAMPTZ DEFAULT now()
);

-- After: vertical split by access pattern
CREATE TABLE users (
    id            BIGSERIAL PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_profiles (
    user_id       BIGINT PRIMARY KEY REFERENCES users(id),
    bio           TEXT,
    avatar_url    TEXT,
    preferences   JSONB
);

-- Login: fast, narrow scan
SELECT id, password_hash FROM users WHERE email = 'alice@example.com';

-- Profile page: join only when needed
SELECT u.email, p.bio, p.avatar_url
FROM users u
JOIN user_profiles p ON p.user_id = u.id
WHERE u.id = 42;
```

### Horizontal partitioning — shard by user_id range

```sql
-- Shard 1 (postgres-shard-01): users 1 – 1,000,000
-- Shard 2 (postgres-shard-02): users 1,000,001 – 2,000,000

-- Application routing layer
function get_shard(user_id: number): string {
  if (user_id <= 1_000_000) return 'postgres-shard-01';
  if (user_id <= 2_000_000) return 'postgres-shard-02';
  throw new Error('user_id out of range — need rebalance');
}

async function get_user(user_id: number) {
  const shard = get_shard(user_id);
  return db_pool[shard].query('SELECT * FROM users WHERE id = $1', [user_id]);
}
```

### Horizontal partitioning — hash-based (even distribution)

```python
import hashlib

SHARDS = ["shard-0", "shard-1", "shard-2", "shard-3"]

def shard_for_user(user_id: int) -> str:
    h = int(hashlib.md5(str(user_id).encode()).hexdigest(), 16)
    return SHARDS[h % len(SHARDS)]

# user_id 42 and user_id 999 might land on different shards
# regardless of numeric proximity — good for even spread
```

### PostgreSQL native partitioning (horizontal, single cluster)

```sql
CREATE TABLE orders (
    id         BIGSERIAL,
    user_id    BIGINT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    total      NUMERIC(10,2)
) PARTITION BY RANGE (created_at);

CREATE TABLE orders_2025_q1 PARTITION OF orders
    FOR VALUES FROM ('2025-01-01') TO ('2025-04-01');

CREATE TABLE orders_2025_q2 PARTITION OF orders
    FOR VALUES FROM ('2025-04-01') TO ('2025-07-01');

-- Query with date filter prunes to one partition automatically
SELECT * FROM orders WHERE created_at BETWEEN '2025-02-01' AND '2025-02-28';
```

Native partitioning helps query pruning and maintenance (drop old quarter = drop partition). Cross-machine sharding needs application-level or middleware (Vitess, Citus, custom router) routing.

## 5. The Interview Questions — All of Them, Done Properly

**Q: What is vertical vs horizontal partitioning?**

Vertical partitioning splits data by columns or logical concern — separating auth fields from profile fields, or moving billing to its own database. Horizontal partitioning splits rows across shards by a key — users 1–1M on shard 1, 1M–2M on shard 2. Vertical optimizes access patterns and isolation; horizontal scales dataset size and write throughput.

**Q: Which is better for scaling?**

Horizontal partitioning is the primary scale-out strategy when a single table or database outgrows one machine. Vertical partitioning helps performance and organization but doesn't multiply storage capacity — you still have all rows on one node.

**Q: Give an example of vertical partitioning.**

Split `users` into `users` (id, email, password_hash) and `user_profiles` (user_id, bio, avatar, settings). Login queries hit the small table. Profile updates don't contend with auth row locks.

**Q: Give an example of horizontal partitioning.**

Shard users by `user_id`: hash(user_id) % 4 routes to one of four database instances. Each holds ~25% of users with identical schema. Scale by adding shards and rebalancing.

**Q: How do you choose a shard key?**

Pick a key that appears in most queries (high cardinality, even distribution). `user_id` for user-scoped apps is common. Avoid low-cardinality keys (`country`, `status`) that create hot shards. The ideal key makes most queries single-shard.

**Q: What happens to JOINs after partitioning?**

Vertical: JOIN within same DB is fine; cross-DB JOINs need application-level assembly or denormalization. Horizontal: JOINs within one shard work; cross-shard JOINs are expensive — design to avoid them or use denormalized read models.

**Q: How is this different from replication?**

Replication copies the **same** data to multiple nodes (read scaling, HA). Partitioning **splits** different data across nodes (write/storage scaling). Often combined: each shard has its own read replicas.

## 6. The Traps — What Goes Wrong

**Sharding too early.** 500K rows runs fine on one Postgres with good indexes. Sharding adds routing, rebalancing, and cross-shard query pain. Exhaust vertical options (bigger instance, indexes, read replicas, vertical column split) first.

**Bad shard key.** `shard by created_month` — this month's shard gets all writes; other shards idle. Use hash of high-cardinality key or range with awareness of access patterns.

**Vertical split without query analysis.** You split 47 columns into 47 tables and now every page load does 47 JOINs. Split based on **actual access patterns**, not aesthetics.

**Assuming native PG partitioning = distributed sharding.** `PARTITION BY RANGE` on one server helps maintenance and query pruning. It doesn't scale writes across machines until partitions live on different nodes (Citus, etc.).

**Cross-shard transactions.** Order on shard 1, inventory on shard 2 — need saga or 2PC. Many teams redesign to co-locate related data on the same shard (order + order_items share `user_id` shard key).

**Rebalancing ignored.** Hash % 4 works until you add shard 5. Plan consistent hashing or directory-based routing before you need it.

## 7. Compare With Related Concepts

**Horizontal Partitioning vs Sharding.** Same idea — rows split across nodes. "Sharding" implies separate machines; "partitioning" can mean table partitions on one server or distributed shards.

**Vertical Partitioning vs Database per Service.** Microservices pattern: each service owns its DB. That's vertical split by **domain**, not just columns. Same principle — separate concerns, pay with cross-service queries.

**Horizontal Partitioning vs Consistent Hashing.** Consistent hashing is a *technique* for mapping keys to shards when nodes are added/removed, minimizing data movement. Used in distributed caches (Memcached) and some shard routers.

**Partitioning vs Indexing.** Indexes speed lookups within one dataset. Partitioning splits the dataset itself. Index a 800M-row table helps; at some point you still need fewer rows per node.

**Hot/Cold Storage vs Vertical Partition.** Archiving old orders to cheap storage is often vertical (different table/tier) plus horizontal (time-range partitions). Related patterns, often combined.

## 8. 🧠 The Memory Hook — What Sticks

Fat folder into specialized drawers = vertical (split by *what* data). More filing cabinets with alphabet ranges = horizontal (split by *how many* rows). Wide and slow? Split the folder. Too many folders for one cabinet? Buy another cabinet.
