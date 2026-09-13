# What Is Database Replication

## 1. The Real-World Problem — When You Actually Hit This

It's Friday evening, traffic is peaking, and your primary database hits 100% CPU. Here's the part that surprises people: almost none of that load is writes. It's reads — product pages, dashboards, feeds, every user refresh hammering the one machine that also has to record every order. You can buy a bigger box, but that buys you months, not years, and you still have exactly one database.

Then the worse Friday arrives: that one box dies, and the entire product goes dark. Not degraded — dark. Because a single database is a single point of failure, and no amount of application-tier cleverness fixes that.

So you add a second database machine, breathe easy — and a week later the tickets start: "I changed my name and it flipped back." The user's write succeeded. But the page they landed on read from the second machine, which hadn't received the change yet. Their own data looks reverted to them.

Read load drowning one machine, one machine whose death kills everything, and users seeing stale versions of their own data — those three pains are exactly why replication exists.

## 2. The Analogy — Make the Mechanic Obvious

Think of a bank with a head office and city branches.

Every account change happens at head office — only there. Branches keep a complete copy of the ledger, but branch staff are never allowed to edit it; they can only look things up. Meanwhile, head office constantly mails out little slips describing each change: "Account 4242, add fifty dollars." Each branch reads its slips in order and applies them to its local ledger copy. The ledgers end up identical — just not at the same instant.

Now every piece of the analogy maps to the real thing:

- **Head office** is the **primary** — the only node allowed to accept writes.
- **Branches** are **replicas** — full copies that serve reads locally.
- **The mailed slips** are the **replication stream** — a log of changes, sent in order.
- **Mail delay** is **replication lag** — the gap between a change happening and a copy applying it.
- Depositing at head office and asking your branch about it five minutes later, getting the old balance? That's **broken read-your-own-writes**, the classic user complaint from section 1.
- Head office burns down, so you promote the branch with the most complete ledger — that's **failover**. And the slips still in the mail when the fire started? Those changes are gone. Hold that thought; it becomes the async-replication trap later.
- Even the slip *format* matters: "add fifty dollars" describes the action; a photocopy of the finished ledger line shows the result; the official bound journal is the raw record the bank already keeps for legal reasons. Those three are statement-based, row-based, and log-based replication — coming up.

Once you've got the bank in your head, the technical explanation is just naming the parts.

## 3. The Full Explanation — How It Actually Works

In plain words: you designate one database as the **primary** (MySQL calls it the *source*, older docs say *master*). Every write — insert, update, delete, DDL — goes to it. Every other node is a **replica** (*standby* in PostgreSQL-speak, *slave* in very old docs). Replicas receive every change and apply it in the same order the primary did, so they converge to identical data. Your application sends writes to the primary and spreads reads across everything.

Here's the insight that makes the whole thing feasible: **nobody ever copies tables back and forth.** Your database already records every single change in a log — that's how it survives crashes. PostgreSQL calls it the **write-ahead log (WAL)**, MySQL calls it the **binary log (binlog)**. Replication simply taps into that existing log: a replica connects to the primary, receives log records as they're produced, and replays them locally. Since log order defines the true order of changes, every replica that replays the same log ends up in the same state. The infrastructure was already there; replication just shares it.

**Three ways to describe a change.** Remember the slip formats? This is the real decision underneath them.

*Statement-based* replication ships the SQL text itself — "here, run this INSERT." It's compact, but it breaks on anything non-deterministic: `NOW()`, `UUID()`, `RAND()`, or a `LIMIT` without `ORDER BY` under concurrent writes can legitimately produce *different results* on the replica than on the primary. The copies silently drift apart. MySQL started here and moved away from it for exactly that reason.

*Row-based* replication ships the outcome — "row X now looks like this," before-and-after images. Completely deterministic: whatever functions or races produced it, the replica applies the same final values. The cost is volume — one careless `UPDATE` touching a million rows becomes a million row-images flooding through the log. Modern MySQL defaults to row-based, and that default exists because silent drift is far worse than network bills.

*Log-based* (physical) replication streams the raw WAL itself — the exact bytes PostgreSQL writes for crash recovery. The replica isn't simulating your changes, it's performing the same low-level operations, converging byte-for-byte. Maximum fidelity, minimum surprise. The constraints: the replica must run a compatible major version of the same database, replay is effectively single-threaded (which caps how fast a replica can catch up after a big burst), and you can't filter or transform anything mid-stream. PostgreSQL's *logical replication* decodes the WAL into logical row-changes instead, which relaxes those constraints — selective tables, cross-version upgrades — at the cost of some fidelity around DDL.

**When does the primary say "committed"? Sync, semi-sync, async.** This is the decision that decides what you lose on a bad day.

*Asynchronous*: the primary commits immediately and ships the log afterward. Writes are fast and a slow replica can't stall the primary. The bill comes due at failover: if the primary dies before the log left the building, those committed transactions never reach any replica — promoting a replica quietly erases them. This is the default almost everywhere.

*Synchronous*: the primary refuses to confirm the commit until the replica has the data (flushed to disk, or even fully applied and visible). Now a primary failure loses nothing — but every write pays a network round trip to another machine, and if the replica is unreachable, writes stall cluster-wide. Doing this with every replica rarely survives contact with production.

*Semi-synchronous* is the compromise that most real systems land on for important data: the primary waits for **one** replica to acknowledge receiving the change, then confirms the commit. Worst-case data loss shrinks dramatically without paying full-sync latency. Payments and money-movement paths are where this earns its keep. One precision worth having in interviews: "received" is weaker than "visible" — PostgreSQL lets you tune strictness via `synchronous_commit` levels (`remote_write` → `on` → `remote_apply`, where only `remote_apply` guarantees the replica can actually serve the data before your commit returns).

**Replication lag and the damage it does.** Replicas fall behind for mundane reasons: a giant batch update produces a log firehose, the replica's replay is single-threaded while the primary wrote in parallel, the network is saturated, or — specifically on PostgreSQL standbys — a long-running analytical query forces replay to pause rather than cancel it (`max_standby_streaming_delay`). Lag is normal; the design questions are how much, and who notices.

Users notice in one particularly cruel way: **read-your-own-writes breaks.** Save your profile, get redirected, and the profile page reads from a replica that's four seconds behind — your change appears to have vanished. Refresh, and it's back. Comments that post then disappear, lists that shift between refreshes (reads bouncing across differently-behind replicas), support tickets that look like data loss but aren't. Other people's slightly-stale data is usually fine; *your own* stale data feels like the system lied to you.

The standard fixes, roughly in order of effort: route a user's own reads to the primary for a short grace period after they write (a few seconds of "stickiness"); or be precise about it — capture the write position (`pg_current_wal_lsn()` on the primary, or the GTID set in MySQL), and before serving their read, wait until the replica confirms it has reached that position (`pg_last_wal_replay_lsn()` on the replica, `SELECT WAIT_FOR_EXECUTED_GTID_SET(...)` on MySQL). Or simply accept staleness where the business allows — analytics, recommendations, counts — and spend your precision budget only on paths users personally verify.

**Failover basics.** The primary dies. Someone — or something — must notice (health checks; tools like Patroni for PostgreSQL or Orchestrator for MySQL; cloud platforms do this automatically), decide *which* replica wins promotion (the one furthest along the log), **fence the old primary** so a half-dead zombie can't come back and accept writes alongside the new one — two primaries accepting writes simultaneously is called *split-brain*, and it corrupts data faster than an outage does — then repoint application traffic (proxy, virtual IP, DNS, or the orchestrator doing it for you). With async replication, expect the last sliver of committed writes to be gone; applications that care use idempotency keys and reconciliation to survive that. And practice it: teams that have never rehearsed failover don't have failover, they have a theory. A quieter benefit of replicas: take your backups from one, and the snapshot never loads the primary.

**Why replicas help reads and never writes.** Every write must execute on the primary *and then again* on every replica — adding replicas increases the total write work in the system. The write ceiling is always exactly one machine: the primary. Replicas scale read capacity roughly linearly and buy you survivability. If writes themselves are the bottleneck, replication is the wrong tool — that's caching, batching, and eventually sharding territory.

## 4. See It In Practice — Real Code or Queries

Setting up PostgreSQL streaming replication (labels assume PostgreSQL 12+):

```sql
-- postgresql.conf on the PRIMARY
wal_level = replica      -- put enough detail in the WAL to feed a standby
max_wal_senders = 5      -- how many standbys may stream concurrently

-- pg_hba.conf on the PRIMARY: admit the replica as a replication client
-- host  replication  replicator  10.0.0.15/32  scram-sha-256
```

```bash
# One-time bootstrap, run ON THE REPLICA MACHINE:
pg_basebackup -h primary.internal -U replicator \
  -D /var/lib/postgresql/16/main -P -R
# -P shows progress; -R writes primary_conninfo and creates standby.signal,
# the marker that tells PostgreSQL "boot as a standby and keep streaming"
```

```sql
-- postgresql.conf on the primary: semi-sync for money paths.
-- Commit waits until the standby registered as "standby_a" (application_name)
-- has flushed the WAL. If that standby disappears, writes stall — know the tradeoff.
synchronous_standby_names = 'FIRST 1 (standby_a)'
```

```sql
-- Run ON THE REPLICA. Rough lag while traffic flows:
SELECT now() - pg_last_xact_replay_timestamp() AS replay_delay;

-- Precision check: has a specific write reached me yet?
SELECT pg_last_wal_replay_lsn();   -- compare against the primary's LSN at write time
```

The same story on MySQL 8 (terminology: primary = *source*, replica = *replica*):

```sql
-- On the SOURCE
CREATE USER 'repl'@'10.0.0.%' IDENTIFIED BY 'use-a-real-password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'10.0.0.%';  -- privilege name predates the rename

SET PERSIST binlog_format = 'ROW';  -- row-based is the modern default; make it explicit

-- On the REPLICA (8.0.22+ syntax; older servers say CHANGE MASTER TO)
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST           = 'primary.internal',
  SOURCE_USER           = 'repl',
  SOURCE_PASSWORD       = 'use-a-real-password',
  SOURCE_AUTO_POSITION  = 1;   -- GTID-based: replica tracks what it has, asks for the rest
START REPLICA;

SHOW REPLICA STATUS\G              -- watch Seconds_Behind_Source (older: Seconds_Behind_Master)
```

```sql
-- Semi-sync on MySQL 8.0.26+ (pre-8.0.26 plugins were rpl_semi_sync_master/slave):
INSTALL PLUGIN rpl_semi_sync_source SONAME 'semisync_source.so';
SET GLOBAL rpl_semi_sync_source_enabled = 1;

-- Read-your-own-writes, MySQL flavor: after committing a write on the source,
-- grab SELECT @@GLOBAL.gtid_executed and remember it as :gtid_after_write, then
-- before reading from the replica, block until it has applied that GTID set:
SELECT WAIT_FOR_EXECUTED_GTID_SET(:gtid_after_write, 1);   -- 0 = caught up, 1 = timed out
```

And the application side — read/write splitting with a stickiness window (Node + `pg`, simplified to show the pattern):

```js
import { Pool } from 'pg';

const primary = new Pool({ connectionString: process.env.PRIMARY_URL });
const replicas = [
  new Pool({ connectionString: process.env.REPLICA_1_URL }),
  new Pool({ connectionString: process.env.REPLICA_2_URL }),
];

let rr = 0;
const anyReplica = () => replicas[rr++ % replicas.length]; // round-robin spreads read load

// Who wrote recently? Send THEIR OWN reads to the primary for a grace window.
const pinnedUntil = new Map(); // userId -> epoch ms (per-process; prod uses shared state)

function dbFor(userId, { write = false } = {}) {
  const pinned = (pinnedUntil.get(userId) ?? 0) > Date.now();
  if (write) pinnedUntil.set(userId, Date.now() + 3000); // 3s: covers save -> redirect -> render
  return write || pinned ? primary : anyReplica();
}

export async function renameUser(userId, name) {
  const db = dbFor(userId, { write: true });               // writes NEVER touch replicas
  await db.query('UPDATE users SET name = $2 WHERE id = $1', [userId, name]);
}

export async function getUser(userId) {
  const db = dbFor(userId);                                // own fresh writes -> primary,
  const { rows } = await db.query(                         // everything else -> a replica
    'SELECT id, name FROM users WHERE id = $1', [userId]);
  return rows[0];
}
```

The in-memory map is illustrative — across multiple app instances you'd pin in shared state or at the load balancer, or drop it entirely for the LSN/GTID wait shown above, which is precise instead of guessed.

## 5. Interview Questions — All of Them, Done Properly

**Q: What is database replication, and why do systems use it?**

Replication keeps continuous copies of one database on multiple machines. One node — the primary — accepts all writes and records every change in its log (WAL in PostgreSQL, binlog in MySQL); replicas stream that log and replay the changes, converging to the same data. Systems use it for three reasons: to spread read load across machines, so reads stop drowning the primary; to survive failure, since a replica can be promoted when the primary dies; and to place data closer to users or workloads (regional reads, reporting without touching the primary). The mental model that keeps it straight: replication copies the *change log*, not the data, so replicas are always slightly behind by construction.

**Q: Explain synchronous vs asynchronous replication. What does semi-sync add?**

The question behind the question is: *when does the primary confirm the write?* Asynchronous: immediately, and the log ships afterward. Writes are fast and replicas can't stall the primary, but a primary crash can erase committed transactions that hadn't shipped yet. Synchronous: the primary waits until a replica durably has the data before confirming — nothing is lost on failover, but every write pays a network round trip and replica failures stall writes. Semi-sync waits for exactly one replica to acknowledge receipt — a middle path that shrinks worst-case loss to near zero for one extra hop, commonly enabled for payment or ledger paths. Worth adding: async is the default in essentially every database, and "acknowledged receipt" (MySQL semi-sync, Postgres `remote_write`) is weaker than "visible on the replica" (Postgres `remote_apply`) — knowing that distinction signals real experience.

**Q: What is replication lag, and what user-visible problems does it cause?**

Lag is the delay between the primary applying a change and a replica applying it — caused by oversized batch writes flooding the log, single-threaded replay on the replica, network saturation, or long queries pausing replay (PostgreSQL standbys do this to avoid killing their own readers). The headline consequence is broken read-your-own-writes: the user writes, gets redirected, and reads a replica showing pre-write state — "my change disappeared," then reappears on refresh. Beyond that: inconsistent pages when successive reads hit differently-behind replicas, pagination oddities, and support tickets that mimic data loss. Fixes: pin a user's own reads to the primary briefly after they write, or wait deterministically using log positions (Postgres LSN comparison, MySQL `WAIT_FOR_EXECUTED_GTID_SET`), and accept eventual consistency only on paths users don't personally verify.

**Q: Compare statement-based, row-based, and WAL-based replication. When does each break?**

They differ in *what travels over the wire*. Statement-based sends the SQL text: compact, but non-deterministic constructs — `NOW()`, `UUID()`, `RAND()`, unordered `LIMIT` under concurrency — can execute differently on the replica, so copies silently diverge. Row-based sends the resulting row changes: deterministic regardless of functions or timing, at the cost of log volume — a million-row update ships a million row-images; it's modern MySQL's default precisely because silent drift is unacceptable. WAL/log-based streams the raw physical log the engine already writes for crash recovery: maximum fidelity and byte-identical replicas, but it demands compatible versions, applies serially (capping catch-up speed), and can't be filtered — PostgreSQL's logical replication trades some of that fidelity for flexibility (selected tables, cross-version upgrades). Rule: row-based for correctness-sensitive MySQL, physical streaming for full PostgreSQL mirrors, logical when you need selectivity or upgrades.

**Q: The primary dies. Walk me through failover. Can you lose committed data?**

Detection first: health checks or an orchestrator (Patroni, Orchestrator, or the cloud platform) agree the primary is really gone — premature promotion is how accidents become incidents. Then fencing: isolate the old primary so it cannot wake up and accept writes beside the new one; skipping this risks split-brain, where two primaries accept conflicting writes and reconciliation becomes archaeology. Promotion: pick the replica furthest along the log and raise it. Traffic: repoint clients via proxy, VIP, or DNS. Can you lose data? Yes — with async replication, every transaction the primary confirmed but hadn't yet shipped is gone the moment you promote; that's not a bug, it's the deal you made. Applications hedge with idempotency keys and reconciliation. With semi-sync or full sync on your critical paths, that window closes at the cost of write latency. Last thing: rehearse. An unrehearsed failover is a hypothesis.

**Q: Do replicas improve write throughput?**

No — and answering otherwise is the fastest way to sound junior. Every write must execute on the primary and then again on every replica, so replicas *increase* total write work. Write capacity is capped at whatever one primary machine can absorb, permanently, no matter how many replicas you add. Replicas scale reads and availability. When writes are the bottleneck, the moves are: reduce writes (cache, batch, aggregate), tune the primary, then shard — distributing disjoint subsets of data across primaries, which is a different architecture with its own costs.

**Q: How does replication affect frontend clients?**

Indirectly but concretely: after a write, the next screen must not read stale data — that's the "my edit didn't save" bug, and it's fixed server-side (pinning or log-position waits), never by blaming the UI. Read paths that round-robin replicas can serve visibly inconsistent sequences — a list that changes between paginated fetches. Optimistic UI that assumes immediate persistence will occasionally disagree with what a replica serves later. And incident behavior changes: when the primary fails over, write requests fail or hang for seconds — frontends need sensible retries with idempotency, not infinite spinners. The frontend contract to internalize: reads are eventually consistent unless you've deliberately paid to make a given read strongly consistent.

**Q: What do you monitor for replication in production?**

Not just "is the replica connected" — "how far behind is it," because a connected-but-hours-lagging replica is often worse than a down one: it happily serves ancient data. Watch replica lag (bytes and time: `Seconds_Behind_Source` on MySQL, replay lag via `pg_stat_replication` on the primary side and `pg_last_xact_replay_timestamp()` on the replica), replication connection state and restarts, apply errors (a replica stuck on a replay error falls behind forever while looking healthy), WAL/binlog disk usage on both sides, and alert on lag thresholds tied to your read-freshness promises. Add a synthetic check that writes and then verifies the value on a replica — that catches broken read-your-writes before users do.

**Q: How would you test replication before trusting it in production?**

Three layers. Functional: integration tests that write and then read-back through the same routing layer users hit, proving pinning/wait logic actually engages. Behavioral: simulate lag (pause replay, throttle network) and assert the app degrades the way you designed — stale-but-flagged reads, retries, no false "saved" confirmations. Operational: chaos drills that kill the primary on schedule and measure time-to-promotion, data-loss window, and whether fencing worked — plus a rehearsal of promoting a replica and repointing traffic in staging with production-shaped data. The metric that matters from all of it: not "tests passed" but "we know our real lag numbers and our real failover time."

## 6. The Traps — What Goes Wrong in Production

**Assuming the replica has the latest write immediately.** The wrong assumption: replication is instant mirroring, so after `UPDATE` succeeds, any node can serve the read. Why it's wrong: async replication — the default — confirms the commit *before* the change leaves the primary, so replicas are behind by design, milliseconds to minutes. What actually happens: save → redirect → stale read → "my change vanished" tickets, intermittent and impossible to reproduce locally, because locally there is one database. The fix: pin the writer's own reads to the primary for a grace window, or wait on a log position (LSN / GTID) before serving that read — precision beats guessing.

**Counting replicas as write capacity.** The wrong assumption: three database nodes = 3× write throughput. Why it's wrong: every write fans out to all nodes; the fan-out adds work, it doesn't parallelize it. What actually happens: the team adds replicas expecting headroom, write latency climbs instead (more apply work, more WAL shipping), and the primary still saturates first. The fix: treat replication as read scaling + availability only; solve write pressure with caching, batching, and eventually sharding.

**Treating failover as lossless.** The wrong assumption: "we have replicas, so a primary crash loses nothing." Why it's wrong: with async replication, transactions confirmed but not yet shipped die with the primary — the bank's slips still in the mail. What actually happens: after promotion, a handful of users' successful operations no longer exist; a charge that returned "success" was never recorded anywhere. The fix: semi-sync (or sync) on money paths, idempotency keys so retried operations can't duplicate, reconciliation jobs comparing upstream truth against the promoted primary, and honest user messaging on the incident.

**Trusting statement-based replication with non-deterministic SQL.** The wrong assumption: same SQL executed on both sides produces same results — always. Why it's wrong: `NOW()`, `UUID()`, `RAND()`, and unordered `LIMIT` depend on timing and execution context that differ per machine. What actually happens: replicas drift slowly and silently — counts disagree, checksums fail weeks later, and nobody can say when it started. The fix: row-based binlog (modern MySQL default), and audit any legacy server still running statement mode.

**Alerting on "replica connected" instead of "replica caught up."** The wrong assumption: green connection status = healthy replication. Why it's wrong: the apply thread can be stuck on an error, or replay paused by a long query, while the connection stays perfectly open. What actually happens: dashboards stay green while the replica serves hour-old data; when the primary finally fails, promotion restores data from hours ago. The fix: alert on lag metrics and apply errors (`Seconds_Behind_Source`, `pg_stat_replication` deltas), plus the synthetic write-then-verify check.

**Skipping fencing during failover.** The wrong assumption: the crashed primary will stay crashed. Why it's wrong: "crashed" is often "network partitioned" or "paused VM" — it can come back convinced it's still primary. What actually happens: two primaries accept writes; data forks; merging divergent histories ranges from painful to impossible. The fix: the failover tool must fence the old node (revoke write access, shoot it down) *before* promoting the replica — Patroni-style consensus and cloud orchestrators exist precisely to enforce this sequence.

**Long reports freezing replication itself (PostgreSQL-specific).** The wrong assumption: running heavy analytics on a standby is free. Why it's wrong: under hot standby, replay pauses rather than remove rows a query is reading (`max_standby_streaming_delay`), so a 20-minute report can freeze WAL replay for 20 minutes. What actually happens: lag balloons during business hours exactly when someone decided to run reports on the replica; freshness-sensitive reads break. The fix: dedicated delayed or reporting replicas sized for it, sane `max_standby_streaming_delay`, or move heavy analytics off transactional replicas entirely.

## 7. Compare With Related Concepts

**Replication vs [sharding](what-is-database-sharding.md).** The confusion is total for most candidates because both mean "multiple database servers." The difference is direction: replication puts *copies of the same data* on every node — every replica can answer any query, and it scales reads and availability. Sharding puts *different slices of the data* on different nodes — no single node holds everything, and it scales writes and dataset size. They compose: a sharded cluster usually replicates each shard. One-line rule: more readers than your primary can bear, or fear of losing the machine → replicate; more writes or data than one machine can bear → shard.

**Replication vs a [read replica](what-is-read-replica.md).** Not rivals — one is the mechanism, the other the deployment. Replication is the general machinery: primary ships its change log, followers apply it. A read replica is that machinery pointed at one job: a follower kept around specifically to absorb read traffic (and often heavier, reporting-shaped traffic). When an interviewer asks about read replicas, they're asking whether you understand lag, read-your-own-writes, and routing — the exact mechanics on this page, applied.

**Replication vs backup.** Both protect against losing the primary, and neither replaces the other. A replica is a continuously-updated twin: near-zero recovery time, can serve reads, but it faithfully reproduces your mistakes — a mistaken `DELETE` is replicated everywhere in seconds. A backup is a point-in-time snapshot: slow to restore, blind to everything after its timestamp, but immune to what happened later. One-line rule: replicas for uptime, backups for regret — run both, and take the backups *from* a replica.

**Replication vs cache (Redis/application-level).** Both let reads skip the primary, and that's where the resemblance ends. A cache is a partial, app-managed, evictable copy with no relationship to database durability — miss, expire, stampede are its native failure modes. A replica is a full, database-managed copy that participates in failover and holds *every* row. Rule: cache to cut load for hot, tolerance-friendly reads; replicate for capacity, consistency guarantees, and survivability — mature systems do both, and the cache sits in front of the replicas, not instead of them.

## 8. 🧠 The Memory Hook

One primary takes every punch and writes its diary; every replica replays the diary slightly late — so writes never scale past one machine, copies multiply readers and survival, and anyone who *just* wrote must read from the author, not the copyist.
