# Database Sharding

## 1. The Real-World Problem — When You Actually Hit This

Your orders database has been running quietly for three years. It holds about 900 million rows now, roughly 800 GB of table plus another few hundred GB of indexes. One Monday morning, dashboards light up: queries that used to return in 5 ms are taking 400 ms. Nothing changed in the code. What changed is physics — the hot part of your indexes no longer fits in RAM, so every lookup that used to be a memory read is now a disk read. `VACUUM` hasn't fully finished on that table in weeks. Your nightly backup crossed 10 hours, which means it now overlaps business hours. You added read replicas, but they only absorb reads — every insert and update still funnels into one primary, and replica lag keeps creeping up. You already bought the biggest machine your cloud provider sells.

That's the exact moment someone in a meeting says "we should shard the database." And it's also the moment teams get hurt, because sharding fixes those problems but introduces a whole new set — and if you reach for it too early, you pay the new costs while keeping the old ones.

## 2. The Analogy — Make the Mechanic Obvious

Think of one giant central library. For years it worked fine. Now the shelves physically can't hold more books (your disk ceiling), the card catalog has grown so large the head librarian can't keep it memorized anymore (your index no longer fits in RAM), and any serious reorganization means closing the whole library for a week (vacuum, backups, migrations).

The fix isn't a bigger building — cities hit that wall too. The fix is branch libraries. Same catalog system in every branch, same rules for lending, but each branch physically holds only a slice of the city's books. That's sharding: same schema on every machine, but each machine stores a different subset of the rows.

Now the interesting part — every hard decision about sharding shows up in the library too:

You need a rule for deciding which branch owns which book. Sort by author surname: A–F goes to branch one, G–M to branch two. Or scramble each author's name into a number and give each branch ownership of a slice of numbers. Or keep a ledger at the front desk that maps each author to their branch. Those three rules are exactly range, hash, and directory sharding.

Notice the trap inside the first rule: new books arrive constantly, and if you filed them by acquisition date, every new arrival lands in the same newest shelf — one branch melts while the others sit idle. That's a hotspot, and it's exactly what happens when you pick a monotonically increasing shard key.

A question like "list every book acquired this month" needs every branch to be consulted, and you wait for the slowest branch to finish counting. That's a cross-shard query — the fan-out-and-merge pattern.

And if a reader wants to reserve two books that happen to sit in different branches, guaranteed together-or-neither? Both branches must coordinate before either commits. That's a distributed transaction.

Finally: when one branch overflows and you open a fifth branch, somebody has to physically move books while all libraries stay open. That's resharding, and it's the most painful operation in the whole system.

## 3. The Full Explanation — How It Actually Works

In plain words: sharding takes one huge logical table and splits its rows horizontally across multiple machines. Every machine runs the same schema, but each owns a disjoint set of rows — users A here, users B there. Contrast this with splitting columns into separate tables, or splitting a table into pieces on one machine — sharding specifically means the pieces live on different servers, each with its own CPU, RAM, and disk.

The column that decides where a row lives is called the **shard key**. Something — your application code, a proxy layer like Vitess, or a database-native component like Citus's coordinator or MongoDB's router — computes "given this shard key value, which machine do I talk to?" That mapping function is the heart of sharding, and its shape decides almost everything about how painful your life will be.

**Hash sharding.** Run the shard key through a hash function, divide by the number of shards, and the remainder picks the machine. Keys scatter evenly, which kills hotspots from skewed values. The price: ordering is destroyed. A range scan like "all orders created last week" can't be answered by one shard even in principle, because neighboring-in-time rows landed on random machines. Also, changing the shard count changes the remainder for nearly every key, so nearly every row must move.

**Range sharding.** Shard 1 owns keys 1–1M, shard 2 owns 1M–2M, or each shard owns one month of data. Range queries become beautifully cheap — "last week's orders" hits exactly one shard. The price: if keys arrive in increasing order (auto-increment IDs, timestamps), every insert goes to the newest shard. One machine absorbs 100% of write load while the rest idle. That's the hotspot problem, and it's why pure range sharding on time-ordered data is usually wrong.

**Directory sharding.** A lookup service maps each key (often each tenant ID) to its shard explicitly. Maximum flexibility — you can move one noisy tenant to a dedicated machine just by updating an entry — but every request pays an extra lookup, and the directory itself becomes something that can bottleneck or fail.

Whichever strategy you choose, the golden path is the same: a query that carries the shard key routes to exactly one machine, where the data subset is small again, the index fits in memory again, and everything is fast. The whole game of sharding is designing your schema and queries so that the overwhelming majority of traffic stays on that golden path.

Everything outside the golden path gets worse. A query without the shard key becomes a scatter-gather: fan out to all N shards, run the query on each, merge results. Latency becomes the slowest shard's latency, and errors become "any shard failing fails the whole query." Joins get hit hardest — a relational database joins tables inside one engine, and after sharding, the two sides of the join may live on different continents of your cluster. The standard escapes: co-locate tables that join often under the same shard key (user row and their orders row land on the same machine, and the join works normally there), denormalize the joined data into one place, or do the join in application code over merged results.

Transactions follow the same fault line. Inside one shard, ACID works exactly as before — that's a genuine benefit of co-location. But a transaction spanning two shards needs two-phase commit (2PC): a coordinator asks every participating shard to durably prepare, waits for unanimous yes votes, then tells everyone to commit. The costs are real — extra network round trips, locks held during the entire voting window, and if the coordinator dies between phases, shards sit holding "in-doubt" prepared transactions that someone must resolve manually (in PostgreSQL you'd inspect `pg_prepared_xacts`). This is why experienced teams treat cross-shard transactions as a schema smell and redesign data placement until related rows share a shard, rather than paying 2PC tax forever.

Two quiet consequences catch teams off guard. First, identity: auto-increment primary keys break, because two machines will happily mint the same `id = 1000`. Sharded systems switch to UUIDs (v4 for randomness, v7 for time-ordering) or Snowflake-style IDs that embed a timestamp plus a unique machine ID plus a counter. Second, operations multiply by N: N backups to schedule, N schema migrations to run in lockstep, N sets of lag and disk and vacuum metrics to watch. Frontend clients never see any of this — sharding hides behind your API — but every backend query now has a placement decision attached.

Which brings us to the question that separates seniors from juniors: **should you shard at all yet?** The escalation ladder comes first. Fix your slow queries and missing indexes — a bad plan replicated onto twelve shards is still a bad plan. Scale vertically while headroom exists — modern machines are enormous. Add read replicas if reads dominate — they're cheap compared to sharding, though they don't help writes. Cache the hot paths. Archive cold data or partition the table locally so maintenance windows shrink. Only when write throughput or data volume genuinely exceeds what one beefy primary plus replicas can serve does sharding earn its cost. And even then, consider whether a system with built-in sharding (CockroachDB, Spanner-style databases, Vitess or Citus in front of MySQL/Postgres) fits better than hand-rolling routing — the tooling automates the plumbing, but it cannot decide your shard key for you.

## 4. See It In Practice — Real Code or Queries

**Hash placement, shown with PostgreSQL partition syntax.** On one machine this is partitioning; put each piece on its own server behind a router and it becomes sharding — the placement math is the same idea:

```sql
-- PostgreSQL syntax. Rows are assigned to pieces by hash(user_id).
-- Each piece would live on a separate server in a real sharded setup.
CREATE TABLE orders (
  id          bigint,
  user_id     bigint NOT NULL,
  total_cents integer,
  created_at  timestamptz NOT NULL DEFAULT now()
) PARTITION BY HASH (user_id);

CREATE TABLE orders_shard_0 PARTITION OF orders FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE orders_shard_1 PARTITION OF orders FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE orders_shard_2 PARTITION OF orders FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE orders_shard_3 PARTITION OF orders FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

**The query shapes that decide everything.** Same table, two very different costs depending on whether the shard key is present:

```sql
-- Single-shard: carries the shard key -> routes to exactly one machine.
SELECT id, total_cents, created_at FROM orders
WHERE user_id = 42
  AND created_at > now() - interval '30 days';

-- Scatter-gather: no shard key -> fans out to ALL shards,
-- every shard scans its own index, results merged afterwards.
SELECT count(*) FROM orders
WHERE created_at > now() - interval '30 days';
```

**An application-side router**, which is how most homegrown sharding actually looks — hash the key, pick the pool, talk to one machine:

```js
import { createHash } from "node:crypto";
import pg from "pg";

const SHARD_COUNT = 4;
const pools = Array.from({ length: SHARD_COUNT }, (_, i) =>
  new pg.Pool({ host: `orders-shard-${i}.internal`, database: "orders" })
);

// Hash the shard key, mod by shard count — the placement decision.
function poolFor(userId) {
  const digest = createHash("md5").update(String(userId)).digest();
  const shard = digest.readUInt32BE(0) % SHARD_COUNT;
  return pools[shard];
}

export async function getOrderHistory(userId) {
  // Carries the shard key -> one network hop, one machine's index.
  return poolFor(userId).query(
    "SELECT id, total_cents, created_at FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [userId]
  );
}
```

**Cross-shard atomicity with two-phase commit** — the thing you're trying to avoid, shown so you recognize it:

```sql
-- PostgreSQL. Two-phase commit across the users shard and the orders shard.
-- Phase 1: each shard durably records "ready" and HOLDS ITS LOCKS while waiting.
PREPARE TRANSACTION 'order_941_users';    -- runs on the users shard
PREPARE TRANSACTION 'order_941_orders';   -- runs on the orders shard

-- Phase 2: only after BOTH voted yes does the coordinator finalize.
COMMIT PREPARED 'order_941_users';
COMMIT PREPARED 'order_941_orders';
```

If the coordinator crashes between the phases, those prepared transactions sit in limbo holding locks until a human resolves them — which is precisely why the standard advice is to model your data so user and their orders share a shard, making this whole dance unnecessary.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is database sharding, and what problem does it solve that indexing or replicas can't?**

Sharding splits one logical table's rows horizontally across multiple machines — each shard has the same schema but owns a distinct subset of rows, chosen by a shard key. Indexes make individual queries faster but can't raise the ceiling on total storage, RAM, or write throughput of a single machine. Replicas copy the *entire* dataset onto other machines, so they scale read throughput and add failover, but every replica still ingests every write — they do nothing for write capacity or total storage. Sharding is the only one of the three that divides the data itself: writes fan out across primaries, and each machine handles a fraction of the rows. Clients never notice — the split hides behind your API — but the backend inherits routing, cross-shard queries, and distributed transactions as new concerns.

**Q: How do you choose a shard key?**

A good shard key satisfies three demands at once: high cardinality (enough distinct values to spread across shards), even distribution (no value dominates — beware tenant IDs where one whale tenant dwarfs everyone else), and alignment with your hottest query pattern, so most queries include the key and hit a single shard. In practice that usually means `user_id` or `tenant_id`, not timestamps. Two extra rules matter: the key must appear in queries for the fast path to exist, and the choice is nearly permanent — changing it later means physically rebuilding the dataset. So derive it from access patterns you're confident about, not patterns you hope to have someday.

**Q: Hash vs range vs directory sharding — when would you pick each?**

Hash sharding distributes load evenly and prevents value-skew hotspots, at the cost of losing key ordering — range scans and "neighboring data together" guarantees die, and resharding when the count changes moves nearly everything unless you use consistent hashing. Pick it when your workload is point lookups by ID and even spread matters most. Range sharding preserves ordering, makes range queries hit single shards, and enables cheap expiry of old data (drop the oldest range), but risks hotspots whenever keys increase monotonically, since all inserts pile onto the newest range. Pick it for time-series or archival workloads where you can accept or mitigate the hotspot. Directory sharding trades an extra lookup hop for total placement flexibility — per-tenant routing, isolating noisy customers onto dedicated hardware. Pick it in multi-tenant B2B systems where tenants vary wildly in size. Most real systems default to hash on a stable entity ID and accept the loss of ordering.

**Q: What is a hotspot, and how do you avoid one?**

A hotspot is one shard receiving wildly disproportionate load. The classic cause is a monotonic shard key under range sharding — auto-increment IDs or timestamps mean every insert lands on the newest shard, which saturates while older shards idle. Another common cause is a celebrity value: one viral user or one giant tenant whose activity dwarfs thousands of others, skewing even a hash layout. Fixes depend on the cause: hash on an unbounded ID instead of ranging on time; if you need time ranges too, shard on `(user_id)` and index `created_at` within each shard instead of sharding on time; for celebrity rows, "salt" the key — append a random suffix so one logical hotspot spreads over several physical shards, then merge on read. The general principle: distribution must come from a dimension your traffic can't concentrate on.

**Q: What happens to JOINs and queries that lack the shard key?**

Any query without the shard key becomes a scatter-gather: the router fans it out to every shard, each shard executes independently, and results merge centrally. Latency equals the slowest shard, throughput multiplies the underlying work by the shard count, and one unhealthy shard fails the whole query. Joins suffer more fundamentally — a traditional database joins tables within one engine's memory, and after sharding the joined rows live on different machines. Three standard escapes, in order of preference: co-locate frequently joined tables under the same shard key so the join happens shard-locally (users and their orders on the same machine); denormalize the needed fields into one table so no runtime join is needed; or merge result sets in application code for genuinely global questions. Dashboards and analytics are the usual victims — mature setups feed them from per-shard rollups or a separate reporting store rather than hammering the transactional cluster with fan-outs.

**Q: How do cross-shard transactions work, and how do real systems avoid them?**

A transaction touching two shards needs two-phase commit: a coordinator asks both shards to durably *prepare* (vote yes while holding all locks), and only after unanimous agreement tells them to *commit*. The costs: two extra network round trips minimum, locks held across the whole voting window, and a nasty failure mode — if the coordinator dies between phases, shards hold in-doubt prepared transactions that block cleanup until a human resolves them. Throughput drops accordingly. So real systems avoid the problem through data modeling: put data that mutates together on the same shard (a user's balance and their transactions), keep cross-entity coordination out of the synchronous path using sagas or eventual consistency where the business allows it, and reserve true 2PC for the rare flows where strong cross-shard atomicity is non-negotiable. If a candidate's first instinct is "we'll just use 2PC everywhere," that's the tell that they haven't operated a sharded system.

**Q: You need to grow from 4 shards to 8. What actually happens?**

Resharding, and it's the operation people underestimate most. With naive `hash(key) % N` placement, changing N changes the destination of nearly every key — you're moving most of your dataset while serving live traffic. Consistent hashing reduces movement to roughly the proportional fraction (adding 4 shards to 4 moves about half the data, not all of it), and starting with many logical buckets mapped onto fewer physical machines (say 32 logical shards on 4 boxes) turns early scaling into bucket relocation instead of re-keying. The live migration recipe: dual-write old and new placements, backfill history, continuously verify parity, then flip reads and retire the old path. And if the *shard key itself* was chosen wrong, none of this helps — that's a full rewrite of data placement. This permanence is why shard key choice deserves the most scrutiny of any decision in the design.

**Q: How do you generate primary keys across shards?**

Auto-increment breaks immediately — each shard has its own counter, so two shards both mint `id = 1000` and uniqueness dies. Standard options: UUIDv4 (globally unique, random, but unordered which hurts B-tree locality), UUIDv7 (time-ordered UUIDs — unique *and* friendly to indexes), or Snowflake-style IDs encoding a timestamp, a machine identifier, and a per-machine sequence into a 64-bit integer, which gives you uniqueness plus sortability plus embedded creation time. Any of these works; the requirement is simply that uniqueness is minted at the application side or derived from something shard-unique, never from a per-shard counter.

**Q: When should you NOT shard?**

Before sharding, in order: profile and fix slow queries with proper indexes — a sequential scan sharded across twelve machines is twelve sequential scans; exhaust vertical scaling — a single large primary with fast disks is far beyond what most products ever need; add read replicas if the pain is read throughput (cheap, but useless for write capacity); cache genuinely hot read paths; and partition or archive cold data locally so maintenance windows shrink. Shard only when write throughput or dataset size demonstrably exceeds one well-tuned machine plus replicas — and prefer a battle-tested sharding layer (Vitess, Citus, MongoDB's built-in sharding, CockroachDB) over hand-rolled routing. The honest senior answer includes the refusal condition: sharding is the most expensive scalability tool you own, so it goes last, not first.

## 6. The Traps — What Goes Wrong in Production

**Sharding before profiling.** Wrong assumption: "queries are slow, we've outgrown our hardware." Why it's wrong: the actual cause is often a missing index or a terrible plan — and sharding faithfully replicates that bad plan onto every machine. What actually happens: you migrate to eight shards over two months of engineering, and queries improve barely at all because each shard still scans millions of rows. The fix: run [EXPLAIN ANALYZE](what-is-explain-analyze.md) and follow the [slow-query debugging loop](how-do-you-debug-a-slow-query.md) first; shard only after the per-query plan is proven efficient. Remember too that indexes themselves can become the problem — see [when indexes hurt](when-can-indexes-hurt-performance.md).

**Monotonic shard key with range sharding.** Wrong assumption: "timestamps are a natural key — data arrives sorted, so ranges will be tidy." Why it's wrong: range sharding sends every key greater than the current boundary to the same shard, and time always increases — so 100% of inserts hit the newest shard forever. What actually happens: one machine redlines its CPU and disk while the other seven idle, and your "distributed" system has the write capacity of one box. The fix: hash on a high-cardinality ID like `user_id`, keep time-based pruning via local `created_at` indexes or partitioning instead of the shard boundary itself.

**Low-cardinality or skewed keys.** Wrong assumption: "country code is a nice stable key — only a handful of values." Why it's wrong: a handful of values can't spread across dozens of shards, and real-world values skew anyway — one tenant can generate more traffic than the next ten thousand combined. What actually happens: some shards overflow while others sit empty, and no amount of hardware rebalancing fixes a placement rule that concentrates data by construction. The fix: composite keys (tenant + user), salting for known celebrity values, or directory sharding that can exile a giant tenant to dedicated hardware.

**Trusting auto-increment IDs across shards.** Wrong assumption: "primary keys are handled by the database." Which database — you now have eight. What actually happens: duplicate IDs across shards corrupt references, and any global uniqueness check or foreign-key-style logic silently breaks. The fix: switch to UUIDv4/v7 or Snowflake-style IDs *before* migrating, and audit every place that assumed IDs were ordered.

**Forgetting the no-shard-key query paths.** Wrong assumption: "our API always filters by user, so everything is single-shard." Reality: admin panels, billing jobs, nightly analytics, and support tools query globally. What actually happens: launch week goes fine, then someone opens the admin dashboard, it fires scatter-gathers against every shard, p99 latency spikes app-wide, and the on-call engineer learns about fan-out the hard way. The fix: inventory every query before choosing the key; give cross-cutting reads dedicated rollups or a reporting store instead of letting them hammer the transactional shards.

**Assuming the shard key can change later.** Wrong assumption: "we'll start simple and re-shard properly once we understand our traffic." Why it's wrong: the shard key determines where every existing row physically lives — changing it means reading and rewriting the entire dataset under live traffic, plus dual-write coordination the whole time. What actually happens: teams discover their early choice is effectively permanent and spend years working around it. The fix: invest the design time upfront, model real access patterns, and leave headroom via logical shards (many buckets on few machines) so growth doesn't force a re-key.

## 7. Compare With Related Concepts

**Sharding vs [partitioning](what-is-partitioning.md).** Same splitting technique, different address. Partitioning cuts a table into pieces that all live on *one* machine — great for shrinking vacuum/backup windows and letting queries skip whole chunks, but it cannot exceed that machine's CPU, RAM, or disk. Sharding scatters the pieces across machines, raising the actual ceilings — and inheriting the distributed-systems costs. Rule: partition to keep one machine manageable; shard when one machine genuinely cannot hold or serve the data.

**Sharding vs [replication](what-is-database-replication.md).** Replication copies the *same* data onto additional machines for fault tolerance and read scaling; sharding divides the data into *different* subsets across machines for write and storage scaling. They solve orthogonal problems and combine routinely — production sharded clusters usually replicate each shard internally. Related nuance: a [read replica](what-is-read-replica.md) scales reads only, since every replica ingests every write; shards are the mechanism that scales writes. Rule: replicas protect one dataset and spread its reads; shards split the dataset itself.

**Hand-rolled sharding vs distributed-SQL databases.** Doing it yourself (app routers, proxies like Vitess/Citus) keeps familiar engines and gives full control, but you own routing, rebalancing, and cross-shard coordination. Systems like CockroachDB or Spanner-style databases shard, replicate, and rebalance automatically — at the cost of new operational surfaces and different latency profiles. Rule: hand-roll for control over a known, stable access pattern; reach for distributed SQL when placement churn is constant and you'd rather buy the machinery than operate it.

## 8. 🧠 The Memory Hook

Sharding answers exactly one question — *which machine owns this row?* — and every benefit and every cost of the whole system flows from asking it: pick the key right and each machine stays small, indexed, and self-contained; pick it wrong and you've traded one overloaded database for eight overloaded ones plus a coordination headache. Before you shard, remember the ladder — index, scale up, replicate, cache, partition — and only climb to sharding when the data itself refuses to fit on one machine.
