# What Is a Read Replica in MySQL?

## 1. The Real-World Problem — When You Actually Hit This

Your shop has been fine for months on one MySQL primary. Then a flash sale hits. Traffic jumps to 50,000 queries a second. Your dashboard shows the primary at 98% CPU, disk I/O flat-lined, and the connection pool almost full.

You profile the workload and the picture is obvious. Ninety-five percent of those queries are reads — catalog pages, search, reviews, user profiles. Five percent are writes — orders, stock reservations, payments.

Every read and every write hits the same machine. Long search queries hold connections and push the checkout writes into a queue until APIs start timing out. You upgrade to the biggest RDS instance you can buy. It helps for a week, then CPU is back at 90%. One box can only get so big.

So you add three read replicas to spread the reads. Now a new bug appears that is worse than slow. A customer edits their shipping address, hits Save, gets redirected to checkout, and sees the old address. Another user posts a review, refreshes, and the review is missing. On the dashboard `Seconds_Behind_Source` has spiked to 35 seconds.

If you do not understand how a replica syncs, how to send reads to the right place, and how to live with lag, replicas make your app look broken instead of fast.

## 2. The Analogy — Make the Mechanic Obvious

Think of a busy newspaper house.

The Chief Editor is the primary. Only the Chief Editor can write a new story, fix a headline, or accept a classified ad. There is exactly one Chief Editor desk.

If every person in the city walks into that office just to read the morning paper, the room jams. The Chief Editor cannot write because the desk is surrounded by readers.

So the Chief Editor writes every approved change onto a single, continuous roll of paper — the binary log. A press copies that roll and a courier carries copies to neighborhood newsstands. Each newsstand is a read replica.

Most people go to a newsstand to read. The newsstand is read-only. If someone wants to place a new ad, the clerk has to send them back to the Chief Editor. You cannot publish by writing on a copy.

Now picture the courier stuck in traffic, or a newsstand busy unboxing a huge stack of papers. That stand is five minutes behind the Chief Editor. If you file an ad at the main desk and run to the nearest stand, your ad is not there yet. If you need to see your own change right away, you have to read it at the main desk until the courier catches up.

That is exactly how a MySQL read replica behaves. One writer, many readers, a log that ships changes async, and a gap in time you must design around.

## 3. The Full Explanation — How It Actually Works

A MySQL read replica is a separate MySQL server that keeps a byte-for-byte copy of the primary by replaying the primary's binary log. The replica serves `SELECT` queries so the primary can spend CPU, memory, and I/O on writes.

In plain words, the primary writes down every change it makes, streams that list to the replica, and the replica replays it locally. Applications send writes to the primary and most reads to replicas.

Here is how the pipeline actually runs.

When your app commits a write on the primary, InnoDB writes the change to its tables and redo log and the server appends the same change to its binary log, the `binlog`. The binlog is an append-only journal of transactions. In modern MySQL it almost always uses Row-Based Replication, which logs the exact before-and-after row images, plus a Global Transaction ID for every transaction. That makes replay deterministic. Statement-based logging that just copies the SQL string breaks on `NOW()`, `UUID()`, and non-deterministic `LIMIT`.

Three threads move those events from primary to replica.

First, the Binlog Dump Thread on the primary. When a replica connects, the primary starts this thread, reads binlog events from disk, and streams them over TCP.

Second, the Replica I/O Thread on the replica. It connects to the primary, authenticates, says "send me everything after this GTID or binlog position," and writes what it receives into a local spool file called the relay log.

Third, the Replica SQL Thread, also called the applier, on the replica. It reads the relay log and applies each event to its own InnoDB tables. It is the only writer on the replica. That separation is what lets the replica stay read-only to normal clients.

You connect the two with one command. Before MySQL 8.0.22 it was `CHANGE MASTER TO`, after that it is `CHANGE REPLICATION SOURCE TO`. They do the same thing, the old name is now an alias.

```sql
-- On the replica: point it at the primary and start replication
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='db-primary.internal',
  SOURCE_USER='repl',
  SOURCE_PASSWORD='repl_password',
  SOURCE_AUTO_POSITION=1;  -- use GTID, not file + position

START REPLICA;
-- Older syntax still works: CHANGE MASTER TO MASTER_HOST=...; START SLAVE;
```

By default this pipeline is asynchronous. The primary commits, writes the binlog, and replies success to your app immediately without waiting for any replica. That gives the lowest write latency but creates two facts you must accept: there is lag, and if the primary crashes before events hit the network, those last few transactions can be lost.

Semi-synchronous replication is the middle ground. The primary waits until at least one replica's I/O thread confirms it has safely written the event to its relay log before completing the commit. The row may not be applied yet, but it is durable on two disks. Fully synchronous systems like InnoDB Cluster with Group Replication wait for a quorum to certify every transaction before anyone commits. No lag, but every write pays consensus latency.

Replication lag is the delay between primary and replica. MySQL exposes it as `Seconds_Behind_Source` in `SHOW REPLICA STATUS`, the age of the transaction the applier is currently executing. Four things cause it most often.

Single-threaded replay. The primary executes writes in parallel across many cores, but a replica with `replica_parallel_workers=0` applies with one thread. MySQL 8.0 lets you run multiple parallel appliers that replay transactions that were already committed together on the primary. Setting `replica_parallel_workers=4` or 8 often drops lag by a factor of several, but you still cannot beat dependency ordering.

```sql
-- On the replica: let it apply independent transactions in parallel
SET GLOBAL replica_parallel_workers = 4;
-- For best parallelism use write-set tracking on the primary
-- primary my.cnf: binlog_transaction_dependency_tracking = WRITESET
```

Long reads on the replica. A big report or `mysqldump` holds a read view, uses memory and I/O, and starves the applier. That is why busy replicas lag exactly when you need them most.

Huge transactions. `DELETE FROM audit_logs WHERE created_at < '2024-01-01'` that touches two million rows is one atomic binlog entry. The primary can commit it incrementally, the replica must replay it atomically before touching the next transaction, so lag spikes for minutes.

Under-sized hardware. A replica with fewer IOPS or less RAM than the primary cannot keep up with sustained write volume even with perfect parallelism.

Because lag is real, you cannot just round-robin every `SELECT` to a replica. Three patterns solve it.

Read-your-writes pinning. When a user writes, you remember their user ID for a few seconds in Redis. Any read from that user in that window goes to the primary. Everyone else keeps hitting replicas. This fixes "I saved but I still see the old value."

Monotonic reads. If a user refreshes twice, you do not want them to jump from a fresh replica to a stale one and see data go backwards. Hash the user to one replica or use sticky routing in your proxy.

Critical-path pinning. Some reads must never be stale: login, balance, inventory reservation, password reset. Hardcode those to the primary no matter what.

A fourth option is GTID causal reads. After a write you capture the new `gtid_executed`, then on the replica you run `SELECT WAIT_FOR_EXECUTED_GTID_SET('...', 1)`. The query blocks until that exact transaction has been applied. Fresh without hammering the primary, at the cost of adding latency to that one request.

What is a replica good for, and what is it not. Use replicas to scale reads, to run `mysqldump` or `xtrabackup` without pausing the primary, and to offload analytics and search indexing. Do not use a replica to scale writes. Writes still go to one primary. If write QPS or data size outgrows one machine, you need sharding or a different topology, not more replicas. And never let normal app users write to a replica. Set `read_only=ON` and `super_read_only=ON` on every replica. A single accidental `INSERT` on a replica diverges the data and breaks replication with duplicate-key errors.

Connections and routing matter. Applications either keep two pools — a small primary pool for writes and a larger replica pool for reads — and choose in code, or they put ProxySQL or an Aurora Reader Endpoint in front and let the proxy split by parsing SQL. Both work. Code routing gives you per-user pinning logic, proxy routing gives you central health checks, failover, and language-agnostic control.

For operations, watch more than `Seconds_Behind_Source`. Track relay log size, `Replica_IO_Running`, `Replica_SQL_Running`, last error codes, and the gap between `Retrieved_Gtid_Set` and `Executed_Gtid_Set`. Alert when lag crosses your SLO, not when it hits zero, because a few hundred milliseconds of lag is normal under load.

## 4. See It In Practice — Real Code or Queries

First, check health on the replica and lock it as read-only.

```sql
-- Run on the replica: is replication alive and how far behind?
SHOW REPLICA STATUS\G

-- What to read in the output:
-- Replica_IO_Running:  Yes     -- streaming binlog from primary
-- Replica_SQL_Running: Yes     -- applying relay log to tables
-- Seconds_Behind_Source: 0     -- lag in seconds (old name: Seconds_Behind_Master)
-- Last_IO_Errno: 0  Last_SQL_Errno: 0
-- Executed_Gtid_Set: aaaa-bbbb-cccc:1-98234

-- Protect the replica from accidental writes
SET GLOBAL read_only = ON;
SET GLOBAL super_read_only = ON;

-- If you need to pause or skip a bad event (dangerous, last resort):
-- STOP REPLICA; SET GLOBAL sql_replica_skip_counter = 1; START REPLICA;
```

Create the replication user on the primary and wire the replica with GTID. Use `SOURCE` on 8.0.22+ and `MASTER` on older releases.

```sql
-- On the primary: user that the replica will connect as
CREATE USER 'repl'@'%' IDENTIFIED BY 'strong_password';
GRANT REPLICATION SLAVE ON *.* TO 'repl'@'%';

-- On the replica: point at the primary and start
CHANGE REPLICATION SOURCE TO
  SOURCE_HOST='db-primary.internal',
  SOURCE_PORT=3306,
  SOURCE_USER='repl',
  SOURCE_PASSWORD='strong_password',
  SOURCE_AUTO_POSITION=1,
  GET_SOURCE_PUBLIC_KEY=1;

START REPLICA;

-- Verify from the replica (MySQL 8.0.22+ also supports SHOW REPLICA STATUS)
-- On MySQL 5.7 use: SHOW SLAVE STATUS\G
```

Parallel appliers are the biggest lever against lag when the primary is write-heavy.

```sql
-- On the replica my.cnf
-- replica_parallel_workers = 4
-- replica_parallel_type = LOGICAL_CLOCK
-- replica_preserve_commit_order = ON

-- Check that workers are running
SHOW PROCESSLIST; -- you will see several "system user" applier threads
```

Application-level routing in Node.js with two pools and a short Redis pin for read-your-writes. Reads stick to the primary for five seconds after a user's own write.

```typescript
import mysql from 'mysql2/promise';
import Redis from 'ioredis';

const primaryPool = mysql.createPool({
  host: process.env.DB_PRIMARY_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'ecommerce',
  connectionLimit: 20,
});

const replicaPool = mysql.createPool({
  host: process.env.DB_REPLICA_HOST, // RDS Reader Endpoint or replica DNS
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: 'ecommerce',
  connectionLimit: 50,
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

interface QueryOptions {
  userId?: string;
  forcePrimary?: boolean;
}

export class DatabaseRouter {
  private static PIN_TTL = 5; // seconds

  static async recordUserWrite(userId: string): Promise<void> {
    // Remember that this user just wrote; force primary for next few seconds
    await redis.set(`user_write_pin:${userId}`, '1', 'EX', this.PIN_TTL);
  }

  static async executeWrite(sql: string, params: unknown[], userId?: string): Promise<unknown> {
    const [result] = await primaryPool.execute(sql, params);
    if (userId) await this.recordUserWrite(userId);
    return result;
  }

  static async executeRead(sql: string, params: unknown[], opts: QueryOptions = {}): Promise<unknown> {
    let pool = replicaPool;

    if (opts.forcePrimary) {
      pool = primaryPool;
    } else if (opts.userId) {
      const pinned = await redis.exists(`user_write_pin:${opts.userId}`);
      if (pinned === 1) pool = primaryPool; // user recently wrote, avoid stale read
    }

    const [rows] = await pool.execute(sql, params);
    return rows;
  }
}

// Usage
// Writes always go to primary and set the pin
// await DatabaseRouter.executeWrite('UPDATE users SET address=? WHERE id=?', [addr, id], userId);
// Stale-sensitive reads check the pin, others go to replica
// const rows = await DatabaseRouter.executeRead('SELECT * FROM users WHERE id=?', [id], { userId });
// const balance = await DatabaseRouter.executeRead('SELECT balance FROM accounts WHERE id=?', [id], { forcePrimary: true });
```

Proxy routing with ProxySQL so services do not each implement splitting. Hostgroup 10 is the primary, 20 is replicas. Rule 1 keeps `SELECT ... FOR UPDATE` on the primary, rule 2 sends plain `SELECT` to replicas.

```sql
-- In ProxySQL Admin (6032)
INSERT INTO mysql_servers (hostgroup_id, hostname, port, max_connections)
VALUES
  (10, 'db-primary.internal', 3306, 200),
  (20, 'db-replica-01.internal', 3306, 500),
  (20, 'db-replica-02.internal', 3306, 500);

INSERT INTO mysql_query_rules (rule_id, active, match_pattern, destination_hostgroup)
VALUES
  (1, 1, '^SELECT.*FOR UPDATE', 10),
  (2, 1, '^SELECT', 20);

LOAD MYSQL SERVERS TO RUNTIME; SAVE MYSQL SERVERS TO DISK;
LOAD MYSQL QUERY RULES TO RUNTIME; SAVE MYSQL QUERY RULES TO DISK;
```

Use replicas for things that should not disturb the primary. Run backups from a replica so the primary never stalls.

```bash
# Take a hot backup from the replica, not the primary
# replica has super_read_only=ON, but backup still works
mysqldump --single-transaction --host=db-replica-01.internal ecommerce > backup.sql
```

## 5. Interview Questions — All of Them, Done Properly

**Q: What is a MySQL read replica and why would you add one?**

A read replica is a second MySQL server that continuously replays the primary's binlog and serves reads. You add one when most of your load is reads and one machine cannot keep up. Newsstand versus Chief Editor. Users read from stands, only the editor publishes. Replicas scale read throughput, offload backups and analytics, and give you a copy for disaster recovery, but they do not scale writes. Writes still go to one primary.

**Q: How does async replication actually work inside MySQL?**

The primary writes each committed transaction to the binlog. A Binlog Dump Thread on the primary streams those events over TCP. On the replica, an I/O thread receives them and appends them to the relay log. A separate SQL applier thread reads the relay log and executes the changes against InnoDB. You wire it with `CHANGE REPLICATION SOURCE TO SOURCE_HOST=..., SOURCE_AUTO_POSITION=1` and `START REPLICA`. Before 8.0.22 the same statement was spelled `CHANGE MASTER TO MASTER_HOST=...` and `START SLAVE`. The replica knows its position by GTID, so after a restart it asks for "everything after this GTID."

**Q: What is replication lag and how do you measure it?**

Lag is how far behind the replica is. The server field is `Seconds_Behind_Source` in `SHOW REPLICA STATUS`, the age of the transaction the applier is currently running versus the replica's clock. In monitoring also track `Retrieved_Gtid_Set` versus `Executed_Gtid_Set` and relay log size. A few hundred milliseconds is normal. Seconds or minutes means the applier cannot keep up. Causes are single-threaded replay, long reads starving the applier, huge single transactions, or aReplica with weaker hardware than the primary.

**Q: How do parallel appliers help and when do they not help?**

By default a replica applies with one thread even though the primary executed with many, so the replica is the bottleneck. Setting `replica_parallel_workers=4` lets the replica apply independent transactions in parallel. It groups transactions that were committed together on the primary and runs them on different workers. It helps a lot on write-heavy, many-small-transaction workloads. It helps less on a workload with one giant transaction or transactions that touch the same rows and must be serialized anyway.

**Q: What is the read-your-writes problem and how do you fix it?**

A user writes to the primary, then you route their very next `SELECT` to a lagging replica and they do not see their own write. They think the save failed. Fix it with pinning. After a write, set a short Redis key like `user_write_pin:{userId}` with a 5 second TTL. While that key exists, route that user's reads to the primary. After it expires, send them back to replicas. For money or auth paths, skip the trick and always read from the primary. A stronger but slower fix is GTID causal reads with `WAIT_FOR_EXECUTED_GTID_SET`.

**Q: Can I write to a read replica to "spread writes"?**

No. A replica is read-only by design. Set `read_only=ON` and `super_read_only=ON` so even `SUPER` users cannot accidentally insert. Writes must go to the primary or you get divergent rows and replication stops with duplicate-key or key-not-found errors. If you need to scale writes, you need sharding or a multi-writer topology, not more read replicas. The only local writes a replica does are the changes from its own applier.

**Q: What is the difference between Statement-Based and Row-Based Replication?**

Statement-based logs the SQL text and the replica re-executes it. It is compact but breaks on non-determinism like `NOW()`, `UUID()`, or `UPDATE ... LIMIT`. Row-based logs the exact row images that changed. The replica applies those bytes directly instead of re-running expressions. That is deterministic, works with triggers, and allows parallel appliers. Production MySQL uses row-based replication almost everywhere, usually with `binlog_format=ROW` and GTIDs.

**Q: When should I split reads in application code versus with a proxy like ProxySQL?**

Use two pools in code when you have one or two replicas, need per-user logic like Redis pinning, and want to avoid an extra network hop. Use a proxy when you have many services in different languages, want central health checks, automatic removal of a lagging replica, connection multiplexing, and no code changes for failover. The proxy parses SQL and sends `SELECT` to replicas and everything else and `SELECT ... FOR UPDATE` to the primary.

**Q: What happens if a replica crashes? Does it hurt the primary?**

With async replication, no. The primary keeps writing to its binlog. App reads that hit the dead replica fail unless a proxy or health check drains traffic. When the replica comes back, its I/O thread reconnects, says "I have GTIDs up to X," and streams the delta. Semi-sync changes the story slightly: if you require an ack from that replica and it is the only replica, commits will stall until it returns or the timeout falls back to async.

## 6. The Traps — What Goes Wrong in Production

**Writing to the replica.** Someone opens a GUI, sees the replica endpoint, and runs an `UPDATE` there. The data diverges. Days later the applier tries to apply the primary's change to that row and crashes with a duplicate key error. Replication stops, `Replica_SQL_Running` goes to No, and you are repairing by hand or rebuilding from a snapshot. Always set `super_read_only=ON` on every replica and give app users no write grants to replica hosts.

**Write then immediate replica read.** A handler does `INSERT INTO orders ...` and then calls a shared `getOrder(id)` that routes to a replica. The replica has not replayed the insert yet, so the select returns nothing and the checkout throws 404. Fix it by returning the inserted row from the write path or by routing that specific follow-up read to the primary with `forcePrimary`.

**Heavy analytics on web replicas.** A 45-second unindexed report runs on the same replica that serves user traffic. It eats memory and I/O, starves the applier, and lag spikes. Users on that replica get stale data or timeouts. Provision a dedicated analytics replica and route batch jobs there, or cap replica query time with `max_execution_time`.

**One giant transaction.** `DELETE FROM sessions WHERE expires_at < NOW()` erases a million rows in one transaction. The replica must apply all million changes atomically, blocking everything behind it. Chunk the work into small batches with `LIMIT 1000` and short sleeps so the applier can interleave normal traffic.

**Wrapping every read in a transaction.** If you annotate every service method with `@Transactional`, even plain `SELECT` queries run inside a transaction context. Most proxies and routers then pin the whole transaction to the primary, defeating replicas. Keep transactions narrow and only around writes or the few reads that must be consistent with those writes.

**Ignoring monotonic reads.** Routing the first page load to a fresh replica and the next refresh to a stale replica makes data appear to go backwards. Users think the app is losing data. Hash users to one replica or make the proxy sticky per session.

**Forgetting backpressure and observability.** Polling `Seconds_Behind_Source` only on the replica you happen to connect to hides hot replicas. Export lag, relay log size, and error counters from every replica to Prometheus or CloudWatch and alert on SLO breach, not on zero.

## 7. Compare With Related Concepts

**Read Replica vs Master-Slave Replication.** These are not competitors. Master-slave, now called source-replica, is the underlying mechanism: binlog streaming, relay log, GTID positioning, `CHANGE REPLICATION SOURCE TO`. A read replica is a usage pattern on top of that mechanism: point app reads at a replica that is kept read-only. If you talk about master-slave you are naming the plumbing. If you talk about a read replica you are naming the architecture choice to scale reads and offload backups. Rule: every read replica uses source-replica replication, but not every replica has to serve reads. A standby for failover is the same replication with different routing.

**Read Replica vs Group Replication.** A read replica is async by default, single writer, simple, eventually consistent, and cheap to add. Group Replication, the engine behind MySQL InnoDB Cluster, is a consensus protocol. In single-primary mode it still has one writer but every transaction is certified by a quorum before commit, so all members stay consistent and lag is zero. In multi-primary mode several members can write. The trade is latency and operational complexity. Every write pays round-trip certification, conflicts can abort, and you run at least three nodes. Rule: choose read replicas when you need to scale reads and live with milliseconds of lag. Choose Group Replication when you need automatic failover, zero lag reads from any member, or multi-writer, and you can pay the consensus cost.

**Read Replica vs Semi-Synchronous Source-Replica.** Async says "commit now, replicate later." Semi-sync says "commit only after at least one replica has the event on disk." Async is faster, semi-sync guards against losing the last few transactions if the primary dies. Both still have applier lag. Semi-sync does not make replica reads strongly consistent by itself. Rule: enable semi-sync on replicas you would fail over to, keep async for read-scale leaf replicas where you care about write latency more than last-second durability.

**Read Replica vs Sharding.** A replica copies 100% of the data. It multiplies read capacity but does nothing for write capacity or data size. Sharding splits rows by key across many primaries and multiplies writes and storage. Rule: add replicas first for read-heavy workloads. Shard only when writes or total size exceed one primary, because sharding forces cross-shard query and transaction complexity.

**Read Replica vs Cache like Redis.** A replica answers full SQL with indexes and joins, milliseconds behind the primary. A cache answers key lookups from RAM in microseconds but only for keys you populated. Rule: cache hot, small, repeatable results. Use replicas for complex, parameterized relational queries you cannot precompute.

## 8. 🧠 The Memory Hook

A read replica is a newsstand supplied by the primary's binlog courier over an async `CHANGE REPLICATION SOURCE TO` link. Add as many stands as you need for reads and backups, run `replica_parallel_workers` to keep couriers from queuing, and always send writes plus the next read of what you just wrote straight to the Chief Editor's desk.

