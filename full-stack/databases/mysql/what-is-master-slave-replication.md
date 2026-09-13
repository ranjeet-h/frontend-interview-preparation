# What Is Master-Slave Replication in MySQL

## 1. The Real-World Problem — When You Actually Hit This

You launched on a single MySQL server and it was fine for months. Then your product gets featured and traffic goes 10x. Two things break on the same week.

First, reads kill writes. Your app does 95 reads for every 5 writes — browsing catalogs, loading profiles, rendering feeds. One afternoon your analytics team runs a heavy `JOIN` across orders and users without an index. That query eats all CPU and disk I/O on your one database. Checkouts start timing out. Support tickets spike. Not because writes got slower, but because reads and writes share the same box and the reads just starved the writes.

That night, the primary dies. A disk fails or the host kernel panics at 2 a.m. There is no standby. You have backups in S3 but restoring 500 GB, replaying logs, and pointing the app to a new host takes four hours. You lose every order placed in the last few minutes that never made it to the backup. That is a single point of failure.

You fix both by adding replicas. Then you hit the third failure. A user updates their name from Bob to Alice, reloads instantly, and still sees Bob. The read hit a replica that was two seconds behind. They click save again. Now you have duplicate updates and a confused user.

If you promote a replica wrong, you get the fourth failure. The network blips, your monitor thinks the primary is dead, promotes a replica, but the old primary is still alive and still taking writes from some app servers. Now two databases think they are the boss. They both assign the same auto-increment IDs to different rows. Merging that mess is a nightmare. That is split brain.

Master-slave replication — now called primary-replica replication — was built to solve these four problems at once: separate reads from writes, keep a hot standby, deal with lag honestly, and never let two primaries write at the same time.

## 2. The Analogy — Make the Mechanic Obvious

Think of a royal archive with one Master Scribe and several public reading rooms.

The Master Scribe is the only person allowed to write in the master ledger. No one else may add a law, change a title, or cross out a decree in that room. In MySQL that is the primary. It handles every `INSERT`, `UPDATE`, `DELETE`, and `ALTER`.

Every time the Master Scribe writes a line, they also write the exact same change into a private daily diary. That diary is not the ledger itself, it is a sequential log of what changed. In MySQL that diary is the binary log, the binlog. Row-based binlog does not say "run this SQL again," it says "row 42 in table users changed from Bob to Alice."

Each reading room has a courier. The courier stands next to the Master Scribe's desk all day. The instant a new diary line appears, the courier copies it and runs back to their own reading room. That courier is the replica I/O thread. It keeps a persistent TCP connection to the primary.

Back in the reading room, the courier drops the copied page into an inbox tray on the desk. That tray is the relay log. It is just a local queue of changes that have arrived but have not yet been copied into the room's own ledger.

A local assistant sits at that desk, picks up pages from the inbox in exact order, and copies them into the local ledger. That assistant is the replica SQL thread, the applier. Reading rooms are strictly read-only. Citizens can read all day, but they may not write in the local ledger, or the copy will drift from the master.

If the Master Scribe collapses, the council looks at every reading room's inbox and ledger and picks the room that has copied the furthest. They hand that assistant the Master Scribe seal, lock the old master's door so no one can slip in and write, and tell every other courier to run to the new master's desk. That is failover with fencing. If you forget to lock the old door, you end up with two masters writing different laws at the same time, and no one knows which ledger is true.

## 3. The Full Explanation — How It Actually Works

**The name changed, the mechanic did not.** Older MySQL docs and many interview questions still say master and slave. Since MySQL 8, the docs say source and replica, and most teams say primary and replica. The words changed to be clearer and more inclusive, but the behavior is identical: one node takes writes, the others replay its log. In interviews, use primary and replica, but say "historically called master-slave" so the interviewer knows you know both terms. Older commands like `SHOW SLAVE STATUS` still work as aliases for `SHOW REPLICA STATUS`.

**At its core it is log shipping.** The primary does not push SQL results to replicas. It writes every committed change to its binlog on disk, and replicas pull and replay that log. The primary can keep serving writes even if every replica is down. Replicas can catch up later from where they left off.

**Three threads move the log.** When a replica runs `START REPLICA`, two threads start on the replica and one appears on the primary. The binlog dump thread on the primary watches its binlog files like `mysql-bin.000042` and pushes new events over TCP to each connected replica. The replica I/O thread receives those bytes and appends them to its local relay log files like `relay-bin.000013` on disk. The replica SQL thread reads the relay log sequentially and applies each change to its InnoDB tables. In MySQL 8 you can run many applier threads in parallel with `replica_parallel_workers`, so the replica can keep up with a primary that uses many concurrent writers. By default the I/O and SQL threads are separate, so a replica can keep receiving even while it is busy applying.

**What gets logged matters.** MySQL can log the SQL string itself, called statement-based replication, or it can log the exact before-and-after image of every row that changed, called row-based replication. Statement-based is smaller but unsafe, because `NOW()`, `RAND()`, `UUID()`, and triggers give different results when replayed. Row-based is deterministic because it says "this row went from these bytes to those bytes," and it is the default since MySQL 5.7. Almost every production cluster uses `binlog_format = ROW` and `binlog_row_image = FULL` for that reason. The tradeoff is size — a single `DELETE` that touches a million rows creates a million row images in the binlog.

**Two ways to remember where you are.** The old way is file and byte offset, like `mysql-bin.000042, position 107432`. It works but makes failover painful, because when you point a replica at a new primary you have to manually translate the old primary's file and offset into the new primary's file and offset. The modern way is GTID, a Global Transaction Identifier. Every committed transaction gets a unique ID like `3E11FA47-71CA-11E1-9E33-C80AA9E295A4:105` — a server UUID plus a sequence number. A replica remembers the full set it has already executed, called `Executed_Gtid_Set`. On reconnect it just says "I have 1 through 105," and the new primary streams 106 onward. No manual math. GTID with `SOURCE_AUTO_POSITION = 1` is the standard for any cluster that needs automated failover.

**Async is fast and lossy, semi-sync trades a little speed for safety.** By default replication is asynchronous. The primary commits to InnoDB and the binlog, then replies success to your app immediately, without waiting for any replica to receive the event. That gives the lowest write latency but means if the primary loses power a millisecond later, the last committed transaction may never have left the primary's network buffer and it is gone after failover. Semi-synchronous replication fixes the zero-loss case by making the primary wait until at least one replica has written the event to its relay log on disk before replying to the client. It costs one network round trip, typically a few milliseconds, but guarantees that any transaction the app saw as committed exists on at least one replica. Fully synchronous systems like MySQL Group Replication go further and require a quorum to acknowledge, which is consistent but slower.

**Read scaling is routing, not magic.** A primary-replica cluster scales reads, not writes or storage. Every node holds 100 percent of the data, so you cannot store more data or handle more writes by adding replicas. You can handle more `SELECT` traffic by spreading reads across replicas with a proxy like ProxySQL, MySQL Router, HAProxy, or with two connection pools in your app where `readOnly=true` transactions go to replicas. Writes always go to the single primary. If your write volume or dataset exceeds one beefy server, replicas will not help — you need sharding or a different architecture.

**Lag is normal, serving stale data is a choice.** `Seconds_Behind_Source` in `SHOW REPLICA STATUS` tells you how far the applier is behind real time. `Retrieved_Gtid_Set` versus `Executed_Gtid_Set` tells you how many transactions are sitting in the relay log waiting to be applied. Lag appears for predictable reasons: the primary runs many parallel writers but the replica once applied with one thread, a giant 5-million-row `DELETE` in one transaction blocks the applier for a full minute, an `ALTER TABLE` holds a metadata lock, or a table is missing an index on the replica so every row update becomes a full scan during replay. Modern parallel appliers, small batched writes, and online schema change tools keep lag near zero.

**Failover is a sequence, and fencing is not optional.** Tools like Orchestrator, MHA, or MySQL InnoDB Cluster do the same four steps: detect the primary is truly dead from multiple vantage points so a blip does not trigger a false promotion, pick the replica with the most complete `Executed_Gtid_Set`, drain its relay log and promote it by turning off `read_only` and `super_read_only`, and then fence the old primary. Fencing means the old primary is forcibly set to `super_read_only=1` or powered off via STONITH, so even if it wakes up it cannot accept writes. Then traffic is moved with a Virtual IP, a low-TTL DNS change, or a ProxySQL hostgroup update, and the remaining replicas are pointed at the new primary with `CHANGE REPLICATION SOURCE TO SOURCE_AUTO_POSITION=1`.

**Crash safety on the primary matters too.** For the binlog to survive a crash, you want `sync_binlog = 1` and `innodb_flush_log_at_trx_commit = 1` so every commit is durably on disk. Without those, the primary can acknowledge a commit that disappears after a reboot, and every replica will forever be missing it.

## 4. See It In Practice — Real Code or Queries

These snippets are MySQL 8.0+ with GTID. They run on two hosts, primary at `10.0.1.10` and replica at `10.0.1.11`. Do not test write load on a replica that is still `read_only=0`.

Primary configuration, `/etc/mysql/mysql.conf.d/mysqld.cnf`:

```ini
[mysqld]
# Must be unique across the whole cluster
server_id               = 101

# Binary log, keep 7 days, cap file size
log_bin                 = /var/log/mysql/mysql-bin.log
binlog_format           = ROW
binlog_row_image        = FULL
expire_logs_days        = 7
max_binlog_size         = 1G

# GTID makes failover automatic
gtid_mode               = ON
enforce_gtid_consistency = ON

# Crash-safe: every commit durably on disk
sync_binlog             = 1
innodb_flush_log_at_trx_commit = 1
```

On the primary, create a dedicated replication user and take a consistent snapshot:

```sql
-- On primary, as root
CREATE USER 'repl_user'@'%' IDENTIFIED BY 'StrongReplPassword123!';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'repl_user'@'%';
FLUSH PRIVILEGES;

-- Check where GTID is today
SHOW MASTER STATUS;
-- File: mysql-bin.000001  Position: 450
-- Executed_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-15
```

```bash
# Consistent dump that preserves GTID, run on primary host
mysqldump -h 127.0.0.1 -u root -p \
  --single-transaction \
  --triggers --routines \
  --set-gtid-purged=ON \
  --databases production_db > /tmp/backup_with_gtid.sql

# Restore once on the replica host, then never restore again
mysql -h 127.0.0.1 -u root -p < /tmp/backup_with_gtid.sql
```

Replica configuration, `/etc/mysql/mysql.conf.d/mysqld-replica.cnf`:

```ini
[mysqld]
server_id               = 102

relay_log               = /var/log/mysql/mysql-relay-bin.log
log_bin                 = /var/log/mysql/mysql-bin.log
binlog_format           = ROW

gtid_mode               = ON
enforce_gtid_consistency = ON

# Let the applier use 8 workers, keep commit order
replica_parallel_type   = LOGICAL_CLOCK
replica_parallel_workers = 8
replica_preserve_commit_order = ON

# Never allow stray writes on a replica
read_only               = 1
super_read_only         = 1
```

On the replica, point at the primary with GTID auto-positioning and start:

```sql
-- On replica, as root
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST = '10.0.1.10',
  SOURCE_PORT = 3306,
  SOURCE_USER = 'repl_user',
  SOURCE_PASSWORD = 'StrongReplPassword123!',
  SOURCE_AUTO_POSITION = 1,
  SOURCE_SSL = 1;

START REPLICA;
```

Check that both threads are healthy and see lag explicitly:

```sql
SHOW REPLICA STATUS\G
-- Replica_IO_Running: Yes            -- I/O thread connected
-- Replica_SQL_Running: Yes           -- applier thread running
-- Seconds_Behind_Source: 0           -- lag in seconds, 0 is caught up
-- Retrieved_Gtid_Set: 3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-250
-- Executed_Gtid_Set:  3E11FA47-71CA-11E1-9E33-C80AA9E295A4:1-250
-- If Retrieved is 250 but Executed is 240, 10 transactions are queued in the relay log
```

Application read-write splitting pattern in Node.js, two pools and a simple rule:

```js
// Two pools, same credentials, different hosts
import mysql from 'mysql2/promise';

const primaryPool = mysql.createPool({ host: '10.0.1.10', user: 'app', database: 'production_db' });
const replicaPool = mysql.createPool({ host: '10.0.1.11', user: 'app', database: 'production_db' });

// Always write to primary
async function createOrder(userId, total) {
  const [result] = await primaryPool.execute(
    'INSERT INTO orders (user_id, total) VALUES (?, ?)',
    [userId, total]
  );
  return result.insertId;
}

// Reads can go to replica, but critical reads should hit primary
async function getOrderForCheckout(orderId, { forPayment = false } = {}) {
  const pool = forPayment ? primaryPool : replicaPool;
  const [rows] = await pool.execute('SELECT * FROM orders WHERE id = ?', [orderId]);
  return rows[0];
}

// After a write, pin that user's reads to primary for 3 seconds to avoid stale-read surprise
function shouldPinToPrimary(lastWriteAt) {
  return Date.now() - lastWriteAt < 3000;
}
```

Manual promotion when the primary is truly dead. Run this only on the chosen replica that is most caught up:

```sql
-- On the chosen replica
STOP REPLICA;
RESET REPLICA ALL;

-- Allow writes again
SET GLOBAL super_read_only = 0;
SET GLOBAL read_only = 0;

-- Now repoint your proxy or app config to this host for writes.
-- Then on every other replica, point them at the new primary:
-- CHANGE REPLICATION SOURCE TO SOURCE_HOST='10.0.1.11', SOURCE_AUTO_POSITION=1; START REPLICA;
```

Safe batched delete to avoid blocking the replica for minutes:

```sql
-- Instead of one giant DELETE in one transaction, loop in small batches
-- Run this from the primary; the replica will replay many small transactions instead of one huge one

REPEAT
  DELETE FROM audit_logs WHERE created_at < '2025-01-01' LIMIT 2000;
  -- optional pause so the replica applier can keep pace on a busy cluster
  DO SLEEP(0.05);
UNTIL ROW_COUNT() = 0 END REPEAT;
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is master-slave replication, and why do docs now say primary-replica or source-replica?**

Historically MySQL called the write node the master and the copies slaves. The terms were renamed to primary and replica, and in MySQL 8 docs to source and replica, because replica describes the mechanic more clearly and avoids problematic language. The behavior is unchanged: one writeable node streams its binlog to read-only nodes that replay it. If you are answering in an interview, say "primary-replica, historically master-slave," and be ready to recognize `SHOW SLAVE STATUS` as the old alias for `SHOW REPLICA STATUS` and `CHANGE MASTER TO` as the old alias for `CHANGE REPLICATION SOURCE TO`. Interviewers check that you know the mapping.

**Q: How does MySQL replication actually work step by step?**

The primary writes every committed change to its binary log on disk. For each replica, the primary spawns a binlog dump thread that tails that log and sends events over a persistent TCP connection. On the replica, the I/O thread receives those bytes and appends them to the relay log. The SQL applier thread reads the relay log in order and applies each row change to its own InnoDB tables. Because I/O and apply are separate, a replica can keep receiving while it is still catching up. With `binlog_format=ROW` the log carries before-and-after images of each row, so replay is deterministic. With GTID, the replica tells the primary which transaction IDs it already has, and the primary streams exactly the missing ones.

**Q: What is the difference between asynchronous and semi-synchronous replication? When would you choose each?**

Asynchronous is the default. The primary commits locally, writes the binlog, replies success to the client, and replicates in the background. It is the fastest because the client never waits for the network, but if the primary crashes half a millisecond after replying, that transaction may be lost — the replica never got it and the new primary does not have it. Semi-synchronous makes the primary wait until at least one replica has written the event to its relay log on disk before replying to the client. That costs one network round trip, a few milliseconds if the replica is nearby, but guarantees that every transaction the application thought succeeded survives a single-node crash. Choose async when raw write latency dominates and you can tolerate a tiny window of loss, often balanced by automated failover speed. Choose semi-sync when you promised no committed data loss, for example orders, payments, or auth tables. Neither is fully synchronous; Group Replication is the fully synchronous-style option that waits for a quorum.

**Q: What is a GTID and why is it better than binlog file and position?**

A GTID is a globally unique transaction identifier like `server-uuid:sequence`. The server UUID identifies which primary originally committed it, the sequence is a counter on that server. Together the set tells you exactly which transactions a replica has executed. The old coordinate system tracks a file name and byte offset like `mysql-bin.000042:107432`, which is local to one server's log files. On failover with offsets you have to manually find where replica B's position maps inside the new primary's different log file. Get that calculation wrong and you skip or duplicate transactions. With GTID you just use `SOURCE_AUTO_POSITION=1` and the new primary compares its `Executed_Gtid_Set` with the replica's and streams exactly the gap. It makes promotion, repointing siblings, and rebuilding a lagging replica almost trivial.

**Q: What causes replica lag, and how do you keep it low?**

Lag is the delay between commit on the primary and visibility on the replica. The classic cause is a concurrency mismatch: the primary runs many writers in parallel, but the replica once applied with a single thread. A single long transaction also blocks the applier — if you `DELETE` five million rows in one transaction, the applier cannot commit intermediate progress and every later transaction queues behind it. Large `ALTER TABLE` operations, heavy analytics on the same replica that serves live reads, and missing indexes on the replica that turn each row apply into a full table scan also cause lag. Fixes that actually work are enabling parallel apply with `replica_parallel_workers` and `replica_parallel_type=LOGICAL_CLOCK`, breaking huge writes into batches of a few thousand rows with a brief sleep, using online schema tools like `gh-ost` or `pt-online-schema-change` instead of blocking `ALTER`, and isolating analytics to a dedicated reporting replica that is not in the live read pool. Monitor both `Seconds_Behind_Source` and the gap between `Retrieved_Gtid_Set` and `Executed_Gtid_Set`.

**Q: What is the read-your-own-writes problem and how do you solve it?**

Because replication is at least a few milliseconds, a user can write to the primary and then immediately read from a lagging replica and see stale data. They wrote Alice, reloaded, still see Bob, and think the update failed. Solutions are routing, not trying to make lag zero. The simplest is sticky routing: after a write, pin that user's reads to the primary for a short window, for example three to five seconds, using a cookie or session marker with the last write timestamp. The stronger version is GTID tracking: the primary returns the GTID it just committed, the app or proxy asks the replica `SELECT WAIT_FOR_EXECUTED_GTID_SET('uuid:105', 1.0)` and if the replica has not caught up within a second, the read is rerouted to the primary. The most conservative fix is to send safety-critical reads like balances, carts, and login checks straight to the primary and let everything else be eventually consistent on replicas.

**Q: Why should replicas use `super_read_only=1` instead of just `read_only=1`?**

`read_only=1` blocks writes from normal users but still allows anyone with `SUPER` or `SYSTEM_VARIABLES_ADMIN`, which includes `root` and many admin scripts, to write. A well-meaning DBA debugging on the replica can `UPDATE` a row, and now the replica's data has drifted. Later the primary legitimately updates the same row, the applier tries to apply it and fails with a duplicate-key or not-found error, and replication stops cold until someone manually skips the error and fixes the data. `super_read_only=1` blocks writes from everyone, including superusers; only the internal replication applier threads may write. It is a physical guardrail that turns a human mistake into an immediate error instead of silent drift.

**Q: What is split-brain during failover and how do you prevent it?**

Split-brain is two nodes both believing they are the writable primary at the same time. It usually happens on a network partition: the orchestrator cannot reach the old primary, assumes it is dead, promotes a replica, but the old primary is still alive and still reachable from some app servers. Both accept writes with independent auto-increment counters and divergent rows. Recovery is painful because you cannot auto-merge a relational dataset that diverged. Prevention is explicit fencing. Before promoting, the orchestrator must make the old primary unwritable — set it to `super_read_only=1`, kill its network, or cut power via STONITH. Then atomically move write traffic through a proxy like ProxySQL or a Virtual IP so no app server can still reach the old primary. Every app connects to the proxy, never directly to a database IP, so there is exactly one place where primary ownership is decided.

## 6. The Traps — What Goes Wrong in Production

**Async loss on failover — the commit your app thought succeeded vanishes.** With default async replication the primary replies success the instant the commit hits its local disk. If it crashes before the binlog event leaves its socket buffer, no replica has it. After promotion that transaction does not exist on the new primary. Your order service logged a 200 OK but the order row is gone. That is why payment and order flows often use semi-sync or at least track committed GTIDs and verify the new primary has the GTID before telling the user it succeeded. Never promise zero loss if you are running pure async.

**Lag serving stale reads — the user sees yesterday's data.** Even healthy clusters have a few milliseconds of lag. Under load it can spike to seconds. If you route a post-write read to a replica, the user sees stale data and may retry the write, creating duplicates. The fix is not to chase zero lag, it is to route safely. Pin the user's reads to the primary for a few seconds after any write, or use GTID wait checks, or hardwire sensitive pages like checkout and auth to the primary. Alert on `Seconds_Behind_Source > 5` for user-facing replicas, and pull a lagging replica out of the live read pool automatically.

**Writing to a replica — silent drift that later halts replication.** This is the most common on-call surprise. Someone leaves `read_only=0` on a replica, runs a manual fix, and the replica's row now differs from the primary's row. Hours later the primary updates that row, the applier fails with Error 1032 or 1062, and replication stops. Set `read_only=1` and `super_read_only=1` in the config file, not just at runtime, so a reboot does not flip it back. Revoke `SUPER` from app users entirely. Treat `SHOW REPLICA STATUS` where either `Replica_IO_Running` or `Replica_SQL_Running` is not `Yes` as a paging alert.

**One giant transaction stalls the whole replica.** A developer runs `DELETE FROM audit_logs WHERE created_at < '2025-01-01'` touching five million rows in one transaction. On the primary it holds locks for a minute. On the replica the applier must replay five million row images inside a single atomic transaction with no intermediate commits, so lag spikes to minutes and every other update waits in the relay log queue. Always batch large modifications with `LIMIT 2000` loops or a dedicated backfill job, and do it during off-peak.

**DNS caching hides failover.** You updated a DNS record to point `db-primary.internal` at the new primary, but the JVM kept the old IP cached forever because `networkaddress.cache.ttl=-1`, and Node held it for thirty seconds at the OS level. Writes still hit the dead host. Point apps at a database proxy and let the orchestrator move the proxy's hostgroup in milliseconds, or set runtime DNS TTL to one to five seconds and use a low DNS TTL.

**Using the read pool as a free analytics warehouse.** Pointing a heavy unindexed BI report at a production replica pins CPU and disk, the applier starves for I/O, lag explodes, and live users see stale data. Keep a dedicated reporting replica outside the app read pool, give it different indexes or even a columnar replica if needed, and never alert on its lag while you do alert on the user-facing replicas.

## 7. Compare With Related Concepts

**Master-slave replication versus MySQL Group Replication.** Master-slave is strictly one writer. It is simple, fast, and has no write conflicts because only the primary may write. Failover means picking one replica and fencing the old primary so there is never more than one writer. Group Replication, the MySQL InnoDB Cluster implementation, is a quorum-based multi-primary or single-primary mode where multiple members coordinate and most writes require agreement from a majority of nodes. That gives strong consistency and automatic conflict detection, and the set can survive a node loss without manual promotion, but write latency is higher because every commit waits for peers. Rule of thumb: use primary-replica for the common case where one writer handles all writes and you scale reads horizontally. Reach for Group Replication or Galera when you need automatic consensus, active-active writes across racks or regions, or stronger guarantees that two nodes will never silently diverge.

**Primary-replica versus sharding.** Replication copies the entire dataset to every node. It gives you more read throughput and a hot standby, but it does not give you more write throughput or more total disk because each node holds everything. Sharding splits the dataset, for example users 1 to 1,000,000 on shard 1 and 1,000,001 to 2,000,000 on shard 2, so each shard has its own primary and replicas. Sharding scales both writes and storage, but cross-shard transactions and joins become expensive or impossible. Rule of thumb: add replicas first, scale the primary vertically, and only shard when a single primary's write IOPS or dataset size no longer fits.

**Asynchronous versus semi-synchronous versus fully synchronous.** Asynchronous is fastest, replies before the replica knows, and risks a sliver of loss on crash. Semi-synchronous waits for at least one replica to have the event on durable storage on its relay log, which closes the zero-loss gap for single-node failures with one round trip of latency. Fully synchronous Group Replication waits for a quorum to agree before committing, which is the strongest guarantee but the slowest because the slowest node in the quorum sets your write latency. Choose async for throughput-tolerant workloads, semi-sync for committed-must-survive, fully synchronous when you need consensus.

**Primary-replica versus replica as backup.** A replica is not a backup. It helps with high availability and read scale, but a bad `DROP TABLE` on the primary replays instantly to replicas and is gone everywhere. Backups are point-in-time snapshots stored off the hosts, versioned and tested. Always do both: replicas for fast failover, off-host backups for logical errors and disaster recovery.

## 8. 🧠 The Memory Hook

One diary writer, many copiers, never two writers at once. The primary writes the diary, the courier carries it, the tray queues it, the assistant copies it. Guard the replicas with `super_read_only`, watch the gap between Retrieved and Executed, pay one round trip with semi-sync when you cannot afford to lose a commit, and fence the old writer before crowning the new one.
